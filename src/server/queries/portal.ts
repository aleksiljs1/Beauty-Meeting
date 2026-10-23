import "server-only";
import { z } from "zod";
import { requireLessonCapability } from "@/server/access/lesson-access";
import { checkCapability, evaluateLessonAccess, lessonPhase, type LessonAccess, type LessonPhase } from "@/server/access/policy";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { zoomLive } from "@/server/env";
import { ApiError } from "@/server/http";
import { STARTING_SOON_MS } from "@/server/services/live";
import { listMaterials } from "@/server/services/materials";
import { listRecordings } from "@/server/services/recordings";

/**
 * Read queries for the student portal's Server Components. Every lesson goes through the
 * central policy (evaluateLessonAccess / checkCapability / lessonPhase) — no ad-hoc date or
 * enrolment checks here. Values are serialized (ISO strings) so they can be passed to
 * Client Components as props.
 */

const lessonIdSchema = z.uuid();

/** Lesson ids are UUIDs; anything else is indistinguishable from an unknown lesson. */
export function parseLessonId(raw: string): string {
  const parsed = lessonIdSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError("LESSON_NOT_AVAILABLE", "Ky mësim nuk është i disponueshëm.");
  return parsed.data;
}

export async function getAcademyName(): Promise<string> {
  const settings = await prisma.academySettings.findUnique({ where: { id: 1 }, select: { name: true } });
  return settings?.name ?? "Beauty Academy";
}

export type StudentLessonCard = {
  id: string;
  title: string;
  courseTitle: string | null;
  /** Only while the student has current access (hidden for history cards). */
  summary: string | null;
  scheduledStartAt: string;
  scheduledEndAt: string;
  phase: LessonPhase;
  /** Effective deadline (lesson or personal, whichever is earlier). */
  deadline: string | null;
  /** Current access to content (false for expired/cancelled history cards). */
  hasAccess: boolean;
  canJoin: boolean;
  isDemo: boolean;
};

const deadlineOf = (access: LessonAccess) => (access.status === "admin" ? null : access.deadline);

/** All lessons the student is enrolled in that they may still see as a card (one query). */
export async function listStudentLessons(user: AppUser, now = new Date()): Promise<StudentLessonCard[]> {
  const rows = await prisma.lesson.findMany({
    where: { enrollments: { some: { userId: user.id } } },
    orderBy: { scheduledStartAt: "asc" },
    take: 200,
    select: {
      id: true,
      title: true,
      summary: true,
      publication: true,
      meetingStatus: true,
      scheduledStartAt: true,
      scheduledEndAt: true,
      joinOpensAt: true,
      accessExpiresAt: true,
      isDemo: true,
      course: { select: { title: true } },
      enrollments: { where: { userId: user.id }, select: { accessExpiresAt: true, revokedAt: true }, take: 1 },
      _count: { select: { recordings: { where: { status: "READY" } } } },
    },
  });

  const cards: StudentLessonCard[] = [];
  for (const row of rows) {
    const access = evaluateLessonAccess(user, row, row.enrollments[0] ?? null, now);
    if (!checkCapability(access, "VIEW_CARD", row, now).allowed) continue;
    const hasAccess = checkCapability(access, "VIEW_CONTENT", row, now).allowed;
    const deadline = deadlineOf(access);
    cards.push({
      id: row.id,
      title: row.title,
      courseTitle: row.course?.title ?? null,
      summary: hasAccess ? row.summary : null,
      scheduledStartAt: row.scheduledStartAt.toISOString(),
      scheduledEndAt: row.scheduledEndAt.toISOString(),
      phase: lessonPhase(row, access, hasAccess && row._count.recordings > 0, now, STARTING_SOON_MS),
      deadline: deadline?.toISOString() ?? null,
      hasAccess,
      canJoin: hasAccess && checkCapability(access, "JOIN_LIVE", row, now).allowed,
      isDemo: row.isDemo,
    });
  }
  return cards;
}

export type LessonFilter = "all" | "upcoming" | "live" | "replay" | "expired";

const FILTER_PHASES: Record<Exclude<LessonFilter, "all">, LessonPhase[]> = {
  upcoming: ["UPCOMING", "STARTING_SOON", "WAITING_FOR_HOST"],
  live: ["LIVE"],
  replay: ["REPLAY"],
  expired: ["EXPIRED"],
};

export function filterLessons(cards: StudentLessonCard[], filter: LessonFilter): StudentLessonCard[] {
  if (filter === "all") return cards;
  return cards.filter((card) => FILTER_PHASES[filter].includes(card.phase));
}

/** Stage state of the classroom, decided on the server from stored meeting state + policy. */
export type StageState = "NOT_OPEN" | "WAITING" | "LIVE" | "ENDED" | "NOT_READY";

export type ClassroomData = {
  lesson: {
    id: string;
    title: string;
    courseTitle: string | null;
    summary: string | null;
    details: string | null;
    scheduledStartAt: string;
    scheduledEndAt: string;
    joinOpensAt: string;
    deadline: string | null;
    phase: LessonPhase;
    isDemo: boolean;
  };
  /** History view (expired/cancelled): no content is loaded or exposed. */
  history: null | { reason: "EXPIRED" | "CANCELLED" };
  stage: StageState;
  canJoin: boolean;
  /** User-safe reason when join is not allowed right now. */
  joinBlockedMessage: string | null;
  /** Offer the "open in the Zoom app" fallback (live Zoom, real lesson with a meeting). */
  zoomAppFallback: boolean;
  materials: Awaited<ReturnType<typeof listMaterials>>;
  recordings: Array<Omit<Awaited<ReturnType<typeof listRecordings>>[number], "readyAt"> & { readyAt: string | null }>;
  serverTime: string;
};

/**
 * Classroom page data. Throws ApiError LESSON_NOT_AVAILABLE (→ notFound()) when the student
 * may not even see the card. Content (details, materials, recordings) is loaded only with
 * VIEW_CONTENT, through the same services the API uses.
 */
export async function getClassroom(user: AppUser, rawLessonId: string, now = new Date()): Promise<ClassroomData> {
  const lessonId = parseLessonId(rawLessonId);
  const { lesson: base, access } = await requireLessonCapability(user, lessonId, "VIEW_CARD", now);

  const extra = await prisma.lesson.findUniqueOrThrow({
    where: { id: lessonId },
    select: { summary: true, details: true, zoomMeetingNumber: true, course: { select: { title: true } }, _count: { select: { recordings: { where: { status: "READY" } } } } },
  });

  const content = checkCapability(access, "VIEW_CONTENT", base, now);
  const hasAccess = content.allowed;
  const join = hasAccess ? checkCapability(access, "JOIN_LIVE", base, now) : content;
  const deadline = deadlineOf(access);
  const phase = lessonPhase(base, access, hasAccess && extra._count.recordings > 0, now, STARTING_SOON_MS);

  const history =
    base.publication === "CANCELLED"
      ? ({ reason: "CANCELLED" } as const)
      : access.status === "denied" && access.reason === "EXPIRED"
        ? ({ reason: "EXPIRED" } as const)
        : null;

  let stage: StageState;
  if (base.meetingStatus === "LIVE") stage = "LIVE";
  else if (base.meetingStatus === "ENDED") stage = "ENDED";
  else if (base.meetingStatus === "NOT_PROVISIONED" || base.meetingStatus === "ERROR") stage = "NOT_READY";
  else stage = now.getTime() < base.joinOpensAt.getTime() ? "NOT_OPEN" : "WAITING";

  const [materials, recordings] = hasAccess && !history ? await Promise.all([listMaterials(user, lessonId), listRecordings(user, lessonId)]) : [[], []];

  return {
    lesson: {
      id: base.id,
      title: base.title,
      courseTitle: extra.course?.title ?? null,
      summary: hasAccess ? extra.summary : null,
      details: hasAccess ? extra.details : null,
      scheduledStartAt: base.scheduledStartAt.toISOString(),
      scheduledEndAt: base.scheduledEndAt.toISOString(),
      joinOpensAt: base.joinOpensAt.toISOString(),
      deadline: deadline?.toISOString() ?? null,
      phase,
      isDemo: base.isDemo,
    },
    history,
    stage,
    canJoin: !history && join.allowed,
    joinBlockedMessage: join.allowed ? null : join.message,
    zoomAppFallback: zoomLive && !base.isDemo && !!extra.zoomMeetingNumber,
    materials,
    recordings: recordings.map((r) => ({ ...r, readyAt: r.readyAt?.toISOString() ?? null })),
    serverTime: now.toISOString(),
  };
}
