import "server-only";
import { checkCapability, evaluateLessonAccess, isExpired } from "@/server/access/policy";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/http";
import { publishFeedChanged, publishLessonChanged } from "@/server/realtime/publish";
import { audit } from "./audit";

/**
 * Live lesson state and in-site notifications.
 *
 * LIVE is set only by a verified provider event (Zoom webhook, Phase 2) or by the explicitly
 * labelled demo simulation — never by the scheduled time. State never regresses: a delayed
 * "started" event can't reopen an ENDED lesson.
 */

export const STARTING_SOON_MS = 10 * 60_000;

type LiveSource = "demo" | "zoom";

export async function markLessonLive(lessonId: string, source: LiveSource, actorId: string | null, startedAt = new Date()) {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { meetingStatus: true, isDemo: true, publication: true } });
  if (!lesson) throw new ApiError("NOT_FOUND", "Mësimi nuk u gjet.");
  if (source === "demo" && !lesson.isDemo) throw new ApiError("FORBIDDEN", "Simulimi lejohet vetëm për mësimet demo.");
  if (lesson.publication !== "PUBLISHED") throw new ApiError("CONFLICT", "Vetëm mësimet e publikuara mund të fillojnë.");
  if (lesson.meetingStatus === "ENDED") throw new ApiError("CONFLICT", "Ky mësim ka përfunduar.");
  if (lesson.meetingStatus === "LIVE") return; // idempotent

  await prisma.lesson.update({ where: { id: lessonId }, data: { meetingStatus: "LIVE", liveStartedAt: startedAt } });
  await notifyLessonLive(lessonId, startedAt);
  await audit(actorId, source === "demo" ? "lesson.demo_live" : "lesson.live", "lesson", lessonId);
}

export async function markLessonEnded(lessonId: string, source: LiveSource, actorId: string | null, endedAt = new Date()) {
  const result = await prisma.lesson.updateMany({
    where: { id: lessonId, meetingStatus: "LIVE", ...(source === "demo" ? { isDemo: true } : {}) },
    data: { meetingStatus: "ENDED", liveEndedAt: endedAt },
  });
  if (result.count === 0) return; // not live (or already ended) — nothing to do
  // Stale live alerts disappear from the pop-up immediately.
  await prisma.notification.updateMany({
    where: { lessonId, type: "LESSON_LIVE", OR: [{ validUntil: null }, { validUntil: { gt: endedAt } }] },
    data: { validUntil: endedAt },
  });
  await publishLessonChanged(lessonId);
  await audit(actorId, source === "demo" ? "lesson.demo_end" : "lesson.end", "lesson", lessonId);
}

/** Fan-out to currently eligible students only. Deduplicated per live occurrence. */
async function notifyLessonLive(lessonId: string, startedAt: Date) {
  const now = new Date();
  const enrollments = await prisma.lessonEnrollment.findMany({
    where: { lessonId, revokedAt: null, user: { banned: { not: true }, role: "student" } },
    select: { userId: true, accessExpiresAt: true, lesson: { select: { accessExpiresAt: true } } },
  });
  const rows = enrollments
    .map((e) => ({ userId: e.userId, deadline: e.accessExpiresAt && e.accessExpiresAt < e.lesson.accessExpiresAt ? e.accessExpiresAt : e.lesson.accessExpiresAt }))
    .filter((e) => !isExpired(e.deadline, now))
    .map((e) => ({
      userId: e.userId,
      lessonId,
      type: "LESSON_LIVE" as const,
      dedupeKey: `LESSON_LIVE:${lessonId}:${startedAt.toISOString()}`,
      validUntil: e.deadline,
    }));
  if (rows.length) await prisma.notification.createMany({ data: rows, skipDuplicates: true });
  await publishFeedChanged(rows.map((r) => r.userId));
}

export async function notifyRecordingReady(lessonId: string, recordingId: string) {
  const enrollments = await prisma.lessonEnrollment.findMany({
    where: { lessonId, revokedAt: null, user: { banned: { not: true }, role: "student" } },
    select: { userId: true },
  });
  if (!enrollments.length) return;
  await prisma.notification.createMany({
    data: enrollments.map((e) => ({ userId: e.userId, lessonId, type: "RECORDING_READY" as const, dedupeKey: `RECORDING_READY:${recordingId}` })),
    skipDuplicates: true,
  });
  await publishFeedChanged(enrollments.map((e) => e.userId));
}

// ---------------------------------------------------------------------------------------
// Student feed (polled every ~20 s by the authenticated app shell)
// ---------------------------------------------------------------------------------------

export type FeedNotification = {
  id: string;
  type: "LESSON_STARTING_SOON" | "LESSON_LIVE" | "RECORDING_READY";
  lessonId: string | null;
  /** Null when the student no longer has access — the notice stays as harmless history. */
  lessonTitle: string | null;
  createdAt: string;
  readAt: string | null;
  dismissedAt: string | null;
  /** True while this notice should still drive the pop-up/banner. */
  active: boolean;
  /** Join is offered only when the access policy allows it right now. */
  canJoin: boolean;
};

export type LiveFeed = { notifications: FeedNotification[]; unreadCount: number; serverTime: string };

export async function getLiveFeed(user: AppUser, now = new Date()): Promise<LiveFeed> {
  if (user.role === "student") await ensureStartingSoonNotices(user, now);

  const rows = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      type: true,
      lessonId: true,
      createdAt: true,
      readAt: true,
      dismissedAt: true,
      validUntil: true,
      lesson: {
        select: {
          title: true,
          publication: true,
          meetingStatus: true,
          joinOpensAt: true,
          accessExpiresAt: true,
          scheduledStartAt: true,
          enrollments: { where: { userId: user.id }, select: { accessExpiresAt: true, revokedAt: true }, take: 1 },
        },
      },
    },
  });
  const unreadCount = await prisma.notification.count({ where: { userId: user.id, readAt: null } });

  const notifications = rows.map((row): FeedNotification => {
    const lesson = row.lesson;
    const access = lesson ? evaluateLessonAccess(user, lesson, lesson.enrollments[0] ?? null, now) : null;
    const visible = !!lesson && !!access && checkCapability(access, "VIEW_CONTENT", lesson, now).allowed;
    const canJoin = visible && checkCapability(access!, "JOIN_LIVE", lesson!, now).allowed;
    const stillValid = !row.validUntil || row.validUntil > now;
    const active =
      visible &&
      stillValid &&
      ((row.type === "LESSON_LIVE" && lesson!.meetingStatus === "LIVE") ||
        (row.type === "LESSON_STARTING_SOON" && lesson!.meetingStatus !== "LIVE" && lesson!.meetingStatus !== "ENDED"));
    return {
      id: row.id,
      type: row.type,
      lessonId: row.lessonId,
      lessonTitle: lesson && access && checkCapability(access, "VIEW_CARD", lesson, now).allowed ? lesson.title : null,
      createdAt: row.createdAt.toISOString(),
      readAt: row.readAt?.toISOString() ?? null,
      dismissedAt: row.dismissedAt?.toISOString() ?? null,
      active,
      canJoin: active && canJoin,
    };
  });

  return { notifications, unreadCount, serverTime: now.toISOString() };
}

/** Creates "starting soon" notices lazily on poll — no scheduler needed, deduplicated per start time. */
async function ensureStartingSoonNotices(user: AppUser, now: Date) {
  const soon = await prisma.lessonEnrollment.findMany({
    where: {
      userId: user.id,
      revokedAt: null,
      lesson: {
        publication: "PUBLISHED",
        meetingStatus: { in: ["NOT_PROVISIONED", "SCHEDULED"] },
        scheduledStartAt: { gt: now, lte: new Date(now.getTime() + STARTING_SOON_MS) },
        accessExpiresAt: { gt: now },
      },
    },
    select: { lessonId: true, lesson: { select: { scheduledStartAt: true, scheduledEndAt: true } } },
  });
  if (!soon.length) return;
  await prisma.notification.createMany({
    data: soon.map((e) => ({
      userId: user.id,
      lessonId: e.lessonId,
      type: "LESSON_STARTING_SOON" as const,
      dedupeKey: `STARTING_SOON:${e.lessonId}:${e.lesson.scheduledStartAt.toISOString()}`,
      validUntil: e.lesson.scheduledEndAt,
    })),
    skipDuplicates: true,
  });
}

/** Pop-up acknowledged ("Më vonë" / close). Does not mark it read; Join stays available elsewhere. */
export async function dismissNotification(user: AppUser, notificationId: string) {
  await prisma.notification.updateMany({ where: { id: notificationId, userId: user.id, dismissedAt: null }, data: { dismissedAt: new Date() } });
}

export async function markNotificationsRead(user: AppUser, ids: string[] | "all") {
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null, ...(ids === "all" ? {} : { id: { in: ids } }) },
    data: { readAt: new Date() },
  });
}
