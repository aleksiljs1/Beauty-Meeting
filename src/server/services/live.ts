import "server-only";
import { checkCapability, effectiveMeetingStatus, evaluateLessonAccess, isExpired } from "@/server/access/policy";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { ApiError } from "@/server/http";
import { sendMail } from "@/server/mail";
import type { MailMessage } from "@/server/mail";
import { lessonCancelledEmail, lessonLiveEmail, lessonRescheduledEmail } from "@/server/mail/templates";
import { formatTimeRange, formatWeekdayDate, timezoneAbbreviation } from "@/lib/datetime";
import { publishFeedChanged, publishLessonChanged } from "@/server/realtime/publish";
import { audit } from "./audit";

/**
 * Live lesson state and in-site notifications.
 *
 * LIVE is set only by a verified provider event (Zoom webhook or the host's sync) or by the
 * explicitly labelled demo simulation — never by the scheduled time. State never regresses: a
 * delayed "started" event can't reopen an ENDED lesson. When an "ended" event is lost, readers
 * fall back to the schedule (policy.ts `effectiveMeetingStatus`) and the admin can end the class.
 */

export const STARTING_SOON_MS = 10 * 60_000;

type LiveSource = "demo" | "zoom";
/** Who ended the class: the provider, the demo controls, or the admin (when Zoom never reported the end). */
type EndSource = LiveSource | "admin";

const END_AUDIT_ACTION: Record<EndSource, string> = { demo: "lesson.demo_end", zoom: "lesson.end", admin: "lesson.end_manual" };

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

export async function markLessonEnded(lessonId: string, source: EndSource, actorId: string | null, endedAt = new Date()) {
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
  await audit(actorId, END_AUDIT_ACTION[source], "lesson", lessonId);
}

// ---------------------------------------------------------------------------------------
// Verified provider events (Zoom webhooks). Order-safe: each update is conditional on the
// event being newer than the state it changes, so duplicated or delayed deliveries never
// regress the lesson. A genuine restart after the end (newer "started") goes live again.
// ---------------------------------------------------------------------------------------

export type EventOutcome = "applied" | "stale";

export async function applyMeetingStarted(lessonId: string, startedAt: Date): Promise<EventOutcome> {
  const updated = await prisma.lesson.updateMany({
    where: {
      id: lessonId,
      publication: "PUBLISHED",
      OR: [
        { meetingStatus: { in: ["NOT_PROVISIONED", "SCHEDULED", "ERROR"] } },
        { meetingStatus: "ENDED", liveEndedAt: { lt: startedAt } },
      ],
    },
    data: { meetingStatus: "LIVE", liveStartedAt: startedAt, liveEndedAt: null },
  });
  if (updated.count === 0) return "stale";
  await notifyLessonLive(lessonId, startedAt);
  await audit(null, "lesson.live", "lesson", lessonId, { source: "zoom" });
  return "applied";
}

export async function applyMeetingEnded(lessonId: string, endedAt: Date): Promise<EventOutcome> {
  const updated = await prisma.lesson.updateMany({
    where: {
      id: lessonId,
      meetingStatus: { not: "ENDED" },
      // An "ended" older than the current session's start belongs to a previous session.
      OR: [{ liveStartedAt: null }, { liveStartedAt: { lte: endedAt } }],
    },
    data: { meetingStatus: "ENDED", liveEndedAt: endedAt },
  });
  if (updated.count === 0) return "stale";
  await prisma.notification.updateMany({
    where: { lessonId, type: "LESSON_LIVE", OR: [{ validUntil: null }, { validUntil: { gt: endedAt } }] },
    data: { validUntil: endedAt },
  });
  await publishLessonChanged(lessonId);
  await audit(null, "lesson.end", "lesson", lessonId, { source: "zoom" });
  return "applied";
}

// ---------------------------------------------------------------------------------------
// Fan-out. Every notice goes to the same students: an active enrolment on an active student
// account whose (lesson or personal) deadline hasn't passed.
// ---------------------------------------------------------------------------------------

type Recipient = { userId: string; deadline: Date };

async function eligibleRecipients(lessonId: string, now: Date): Promise<Recipient[]> {
  const enrollments = await prisma.lessonEnrollment.findMany({
    where: { lessonId, revokedAt: null, user: { banned: { not: true }, role: "student" } },
    select: { userId: true, accessExpiresAt: true, lesson: { select: { accessExpiresAt: true } } },
  });
  return enrollments
    .map((e) => ({ userId: e.userId, deadline: e.accessExpiresAt && e.accessExpiresAt < e.lesson.accessExpiresAt ? e.accessExpiresAt : e.lesson.accessExpiresAt }))
    .filter((e) => !isExpired(e.deadline, now));
}

type EmailLesson = { id: string; title: string; scheduledStartAt: Date; scheduledEndAt: Date };
type EmailBuilder = (to: { email: string; name: string }, lesson: EmailLesson, academyName: string) => MailMessage;

/**
 * One email per student, in the background: Zoom expects a webhook answer within seconds and
 * an admin action must not wait for a slow mail server. Failures are logged, never thrown, and
 * addresses are never logged.
 */
function emailInBackground(kind: string, lessonId: string, userIds: string[], build: EmailBuilder) {
  if (!userIds.length) return;
  void (async () => {
    const [lesson, settings, users] = await Promise.all([
      prisma.lesson.findUnique({ where: { id: lessonId }, select: { id: true, title: true, scheduledStartAt: true, scheduledEndAt: true } }),
      prisma.academySettings.findUnique({ where: { id: 1 }, select: { name: true } }),
      prisma.user.findMany({ where: { id: { in: userIds } }, select: { email: true, name: true } }),
    ]);
    if (!lesson) return;
    let failed = 0;
    for (const user of users) {
      try {
        await sendMail(build(user, lesson, settings?.name ?? "Akademia CEM"));
      } catch {
        failed += 1; // one bad address must not stop the others
      }
    }
    if (failed) console.error(`[live] some ${kind} emails failed`, { lessonId, failed, total: users.length });
  })().catch((error) => console.error(`[live] ${kind} emails failed`, { lessonId, error: (error as Error).message }));
}

const lessonUrl = (lessonId: string, query = "") => new URL(`/portal/mesimet/${lessonId}${query}`, env.APP_URL).toString();
const scheduleText = (lesson: EmailLesson) =>
  `${formatWeekdayDate(lesson.scheduledStartAt)}, ${formatTimeRange(lesson.scheduledStartAt, lesson.scheduledEndAt)} (${timezoneAbbreviation(lesson.scheduledStartAt)})`;

/** Ends this lesson's still-open pop-up notices of these types (they describe a time that no longer applies). */
async function closeNotices(lessonId: string, types: ("LESSON_LIVE" | "LESSON_STARTING_SOON")[], at: Date) {
  await prisma.notification.updateMany({
    where: { lessonId, type: { in: types }, OR: [{ validUntil: null }, { validUntil: { gt: at } }] },
    data: { validUntil: at },
  });
}

/** Deduplicated per live occurrence; runs once per occurrence (the caller's state change is the guard). */
async function notifyLessonLive(lessonId: string, startedAt: Date) {
  const recipients = await eligibleRecipients(lessonId, new Date());
  const rows = recipients.map((r) => ({
    userId: r.userId,
    lessonId,
    type: "LESSON_LIVE" as const,
    dedupeKey: `LESSON_LIVE:${lessonId}:${startedAt.toISOString()}`,
    validUntil: r.deadline,
  }));
  if (rows.length) await prisma.notification.createMany({ data: rows, skipDuplicates: true });
  await publishFeedChanged(rows.map((r) => r.userId));
  // "The class has started", with a link that opens the lesson and joins automatically.
  emailInBackground("lesson-live", lessonId, rows.map((r) => r.userId), (to, lesson, academyName) =>
    lessonLiveEmail({ to: to.email, name: to.name, lessonTitle: lesson.title, url: lessonUrl(lesson.id, "?bashkohu=1"), academyName }),
  );
}

export async function notifyRecordingReady(lessonId: string, recordingId: string) {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { publication: true } });
  if (lesson?.publication !== "PUBLISHED") return; // students can't open it anyway
  const recipients = await eligibleRecipients(lessonId, new Date());
  if (!recipients.length) return;
  await prisma.notification.createMany({
    data: recipients.map((r) => ({ userId: r.userId, lessonId, type: "RECORDING_READY" as const, dedupeKey: `RECORDING_READY:${recordingId}` })),
    skipDuplicates: true,
  });
  await publishFeedChanged(recipients.map((r) => r.userId));
}

/** A published lesson was cancelled: tell its students (in the site and by email) and close its pop-ups. */
export async function notifyLessonCancelled(lessonId: string, now = new Date()) {
  await closeNotices(lessonId, ["LESSON_LIVE", "LESSON_STARTING_SOON"], now);
  const recipients = await eligibleRecipients(lessonId, now);
  if (recipients.length) {
    await prisma.notification.createMany({
      data: recipients.map((r) => ({ userId: r.userId, lessonId, type: "LESSON_CANCELLED" as const, dedupeKey: `LESSON_CANCELLED:${lessonId}:${now.toISOString()}` })),
      skipDuplicates: true,
    });
  }
  await publishLessonChanged(lessonId);
  emailInBackground("lesson-cancelled", lessonId, recipients.map((r) => r.userId), (to, lesson, academyName) =>
    lessonCancelledEmail({ to: to.email, name: to.name, lessonTitle: lesson.title, when: scheduleText(lesson), url: lessonUrl(lesson.id), academyName }),
  );
}

/** A published lesson moved: tell its students the new time and drop "starts soon" notices for the old one. */
export async function notifyLessonRescheduled(lessonId: string, newStart: Date, now = new Date()) {
  await closeNotices(lessonId, ["LESSON_STARTING_SOON"], now);
  const recipients = await eligibleRecipients(lessonId, now);
  if (recipients.length) {
    await prisma.notification.createMany({
      data: recipients.map((r) => ({
        userId: r.userId,
        lessonId,
        type: "LESSON_RESCHEDULED" as const,
        // Once per new time: saving the same schedule twice doesn't notify twice.
        dedupeKey: `LESSON_RESCHEDULED:${lessonId}:${newStart.toISOString()}`,
      })),
      skipDuplicates: true,
    });
  }
  await publishLessonChanged(lessonId);
  emailInBackground("lesson-rescheduled", lessonId, recipients.map((r) => r.userId), (to, lesson, academyName) =>
    lessonRescheduledEmail({ to: to.email, name: to.name, lessonTitle: lesson.title, when: scheduleText(lesson), url: lessonUrl(lesson.id), academyName }),
  );
}

// ---------------------------------------------------------------------------------------
// Student feed (polled every ~20 s by the authenticated app shell)
// ---------------------------------------------------------------------------------------

export type FeedNotification = {
  id: string;
  type: "LESSON_STARTING_SOON" | "LESSON_LIVE" | "RECORDING_READY" | "LESSON_CANCELLED" | "LESSON_RESCHEDULED";
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
          scheduledEndAt: true,
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
    const meeting = lesson ? effectiveMeetingStatus(lesson, now) : null;
    const active =
      visible &&
      stillValid &&
      ((row.type === "LESSON_LIVE" && meeting === "LIVE") || (row.type === "LESSON_STARTING_SOON" && meeting !== "LIVE" && meeting !== "ENDED"));
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
