import "server-only";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import type { Prisma } from "@/generated/prisma/client";
import type { PublicationStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { ApiError } from "@/server/http";
import { s3 } from "@/server/storage/storage";
import { invitationStatus, rosterEntryState } from "./invitation-status";

/**
 * Read models for the administrator portal. Callers must already have verified the admin
 * (requirePageUser("admin") / requireApiUser(request, "admin")). Nothing here returns object
 * keys, token hashes or presigned URLs.
 */

export const ADMIN_PAGE_SIZE = 25;
const HOUR = 3_600_000;

export type Paged<T> = { items: T[]; page: number; pageCount: number; total: number };

const pageArgs = (page: number, size = ADMIN_PAGE_SIZE) => ({ skip: (Math.max(1, page) - 1) * size, take: size });
const paged = <T>(items: T[], total: number, page: number, size = ADMIN_PAGE_SIZE): Paged<T> => ({
  items,
  total,
  page: Math.max(1, page),
  pageCount: Math.max(1, Math.ceil(total / size)),
});

const activeStudentWhere: Prisma.UserWhereInput = { role: "student", banned: { not: true } };

// --- Dashboard -----------------------------------------------------------------------------

const dashboardLessonSelect = {
  id: true,
  title: true,
  scheduledStartAt: true,
  scheduledEndAt: true,
  publication: true,
  meetingStatus: true,
  liveStartedAt: true,
  isDemo: true,
  _count: { select: { enrollments: { where: { revokedAt: null } } } },
} as const;

export type DashboardIssue = {
  kind: "RECORDING_FAILED" | "RECORDING_STALLED" | "MATERIAL_FAILED" | "MATERIAL_STALLED";
  id: string;
  lessonId: string;
  lessonTitle: string;
  name: string | null;
  message: string | null;
  at: Date;
};

export async function getAdminDashboard(now = new Date()) {
  const stale = new Date(now.getTime() - HOUR);
  const [activeStudents, live, upcoming, upcomingCount, failedRecordings, stalledRecordings, failedMaterials, stalledMaterials] = await Promise.all([
    prisma.user.count({ where: activeStudentWhere }),
    prisma.lesson.findMany({ where: { meetingStatus: "LIVE" }, orderBy: { liveStartedAt: "desc" }, select: dashboardLessonSelect, take: 10 }),
    prisma.lesson.findMany({
      where: { scheduledStartAt: { gt: now }, publication: { in: ["PUBLISHED", "DRAFT"] }, meetingStatus: { not: "LIVE" } },
      orderBy: { scheduledStartAt: "asc" },
      select: dashboardLessonSelect,
      take: 8,
    }),
    prisma.lesson.count({ where: { scheduledStartAt: { gt: now }, publication: "PUBLISHED" } }),
    prisma.recording.findMany({
      where: { status: "FAILED" },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { id: true, lessonId: true, displayName: true, errorMessage: true, updatedAt: true, lesson: { select: { title: true } } },
    }),
    prisma.recording.findMany({
      where: { status: "IMPORTING", updatedAt: { lt: stale } },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { id: true, lessonId: true, displayName: true, updatedAt: true, lesson: { select: { title: true } } },
    }),
    prisma.lessonMaterial.findMany({
      where: { status: "FAILED" },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { id: true, lessonId: true, displayName: true, updatedAt: true, lesson: { select: { title: true } } },
    }),
    prisma.lessonMaterial.findMany({
      where: { status: "PENDING", createdAt: { lt: stale } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, lessonId: true, displayName: true, createdAt: true, lesson: { select: { title: true } } },
    }),
  ]);

  const issues: DashboardIssue[] = [
    ...failedRecordings.map((r) => ({ kind: "RECORDING_FAILED" as const, id: r.id, lessonId: r.lessonId, lessonTitle: r.lesson.title, name: r.displayName, message: r.errorMessage, at: r.updatedAt })),
    ...stalledRecordings.map((r) => ({ kind: "RECORDING_STALLED" as const, id: r.id, lessonId: r.lessonId, lessonTitle: r.lesson.title, name: r.displayName, message: null, at: r.updatedAt })),
    ...failedMaterials.map((m) => ({ kind: "MATERIAL_FAILED" as const, id: m.id, lessonId: m.lessonId, lessonTitle: m.lesson.title, name: m.displayName, message: null, at: m.updatedAt })),
    ...stalledMaterials.map((m) => ({ kind: "MATERIAL_STALLED" as const, id: m.id, lessonId: m.lessonId, lessonTitle: m.lesson.title, name: m.displayName, message: null, at: m.createdAt })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const toCard = ({ _count, ...lesson }: (typeof live)[number]) => ({ ...lesson, students: _count.enrollments });
  return { activeStudents, upcomingCount, live: live.map(toCard), upcoming: upcoming.map(toCard), issues };
}

// --- Students ------------------------------------------------------------------------------

function studentSearch(q?: string): Prisma.UserWhereInput {
  const term = q?.trim().slice(0, 100);
  return {
    role: "student",
    ...(term ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { email: { contains: term, mode: "insensitive" } }] } : {}),
  };
}

export type AdminStudentRow = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  hasPassword: boolean;
  enrollments: number;
  createdAt: Date;
};

export async function listStudents(params: { q?: string; page?: number }): Promise<Paged<AdminStudentRow>> {
  const page = params.page ?? 1;
  const where = studentSearch(params.q);
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      ...pageArgs(page),
      select: {
        id: true,
        name: true,
        email: true,
        banned: true,
        createdAt: true,
        accounts: { where: { providerId: "credential", password: { not: null } }, select: { id: true }, take: 1 },
        _count: { select: { enrollments: { where: { revokedAt: null } } } },
      },
    }),
    prisma.user.count({ where }),
  ]);
  return paged(
    rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      active: !u.banned,
      hasPassword: u.accounts.length > 0,
      enrollments: u._count.enrollments,
      createdAt: u.createdAt,
    })),
    total,
    page,
  );
}

/** Student picker for "add to lesson": active students, flagged when already enrolled. */
export async function searchStudentsForLesson(lessonId: string, q: string) {
  const rows = await prisma.user.findMany({
    where: { ...studentSearch(q), banned: { not: true } },
    orderBy: { name: "asc" },
    take: 10,
    select: { id: true, name: true, email: true, enrollments: { where: { lessonId }, select: { revokedAt: true }, take: 1 } },
  });
  return rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    enrollment: u.enrollments[0] ? (u.enrollments[0].revokedAt ? ("REVOKED" as const) : ("ACTIVE" as const)) : null,
  }));
}

// --- Lessons -------------------------------------------------------------------------------

export type LessonListFilter = { publication?: PublicationStatus; when?: "upcoming" | "past"; page?: number };

export async function listLessons(filter: LessonListFilter, now = new Date()) {
  const page = filter.page ?? 1;
  const where: Prisma.LessonWhereInput = {
    ...(filter.publication ? { publication: filter.publication } : {}),
    ...(filter.when === "upcoming" ? { scheduledEndAt: { gt: now } } : filter.when === "past" ? { scheduledEndAt: { lte: now } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.lesson.findMany({
      where,
      orderBy: filter.when === "upcoming" ? { scheduledStartAt: "asc" } : { scheduledStartAt: "desc" },
      ...pageArgs(page),
      select: {
        id: true,
        title: true,
        scheduledStartAt: true,
        scheduledEndAt: true,
        accessExpiresAt: true,
        publication: true,
        meetingStatus: true,
        isDemo: true,
        course: { select: { title: true } },
        _count: { select: { enrollments: { where: { revokedAt: null } }, materials: { where: { status: "READY" } } } },
      },
    }),
    prisma.lesson.count({ where }),
  ]);
  return paged(
    rows.map(({ _count, course, ...lesson }) => ({ ...lesson, courseTitle: course?.title ?? null, students: _count.enrollments, materials: _count.materials })),
    total,
    page,
  );
}

export async function getAdminLesson(lessonId: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      title: true,
      summary: true,
      details: true,
      courseId: true,
      scheduledStartAt: true,
      scheduledEndAt: true,
      joinOpensAt: true,
      accessExpiresAt: true,
      publication: true,
      meetingStatus: true,
      liveStartedAt: true,
      liveEndedAt: true,
      isDemo: true,
      createdAt: true,
      updatedAt: true,
      course: { select: { title: true } },
      _count: { select: { enrollments: true } },
    },
  });
  if (!lesson) return null;
  const { _count, course, ...rest } = lesson;
  return { ...rest, courseTitle: course?.title ?? null, enrollmentCount: _count.enrollments };
}

export async function requireAdminLesson(lessonId: string) {
  const lesson = await getAdminLesson(lessonId);
  if (!lesson) throw new ApiError("NOT_FOUND", "Mësimi nuk u gjet.");
  return lesson;
}

export type AdminLesson = NonNullable<Awaited<ReturnType<typeof getAdminLesson>>>;

export async function listCourses() {
  return prisma.course.findMany({ orderBy: [{ position: "asc" }, { title: "asc" }], select: { id: true, title: true } });
}

// --- Roster & invitations --------------------------------------------------------------------

export const ROSTER_PAGE_SIZE = 50;

export async function getLessonRoster(lessonId: string, page = 1, now = new Date()) {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { accessExpiresAt: true } });
  if (!lesson) throw new ApiError("NOT_FOUND", "Mësimi nuk u gjet.");
  const where = { lessonId };
  const [rows, total] = await Promise.all([
    prisma.lessonEnrollment.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      ...pageArgs(page, ROSTER_PAGE_SIZE),
      select: {
        id: true,
        source: true,
        accessExpiresAt: true,
        revokedAt: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true, banned: true } },
      },
    }),
    prisma.lessonEnrollment.count({ where }),
  ]);
  return paged(
    rows.map((e) => {
      const state = rosterEntryState(lesson, e, !!e.user.banned, now);
      return {
        id: e.id,
        source: e.source,
        student: { id: e.user.id, name: e.user.name, email: e.user.email },
        ownDeadline: e.accessExpiresAt,
        effectiveDeadline: state.deadline,
        deadlineIsOwn: !!e.accessExpiresAt && e.accessExpiresAt.getTime() < lesson.accessExpiresAt.getTime(),
        status: state.status,
        revokedAt: e.revokedAt,
        createdAt: e.createdAt,
      };
    }),
    total,
    page,
    ROSTER_PAGE_SIZE,
  );
}

export type RosterEntry = Awaited<ReturnType<typeof getLessonRoster>>["items"][number];

export async function listLessonInvitations(lessonId: string, now = new Date()) {
  const rows = await prisma.lessonInvitation.findMany({
    where: { lessonId },
    orderBy: { createdAt: "desc" },
    take: 50,
    // Never the token hash: after creation, only counts and status are shown.
    select: { id: true, redeemUntil: true, accessExpiresAt: true, maxRedemptions: true, redemptionCount: true, revokedAt: true, createdAt: true, email: true },
  });
  return rows.map((row) => ({ ...row, status: invitationStatus(row, now) }));
}

export type AdminInvitation = Awaited<ReturnType<typeof listLessonInvitations>>[number];

// --- Audit log -------------------------------------------------------------------------------

export async function listAuditLog(page = 1) {
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...pageArgs(page),
      select: { id: true, action: true, targetType: true, targetId: true, createdAt: true, actorId: true, actor: { select: { name: true } } },
    }),
    prisma.auditLog.count(),
  ]);

  // Resolve readable target names in two batched queries (no N+1).
  const ids = (type: string) => [...new Set(rows.filter((r) => r.targetType === type && r.targetId).map((r) => r.targetId!))];
  const [lessons, users] = await Promise.all([
    prisma.lesson.findMany({ where: { id: { in: ids("lesson").filter(isUuid) } }, select: { id: true, title: true } }),
    prisma.user.findMany({ where: { id: { in: ids("user") } }, select: { id: true, name: true } }),
  ]);
  const names = new Map<string, string>([...lessons.map((l) => [l.id, l.title] as const), ...users.map((u) => [u.id, u.name] as const)]);

  return paged(
    rows.map((r) => ({
      id: r.id,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      targetName: r.targetId ? (names.get(r.targetId) ?? null) : null,
      actorName: r.actor?.name ?? null,
      hasActor: r.actorId !== null,
      createdAt: r.createdAt,
    })),
    total,
    page,
  );
}

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// --- Integrations ----------------------------------------------------------------------------

/** Names the Zoom integration (Phase 2) will read. Only presence is ever reported. */
export const ZOOM_ENV_VARS = [
  "ZOOM_ACCOUNT_ID",
  "ZOOM_CLIENT_ID",
  "ZOOM_CLIENT_SECRET",
  "ZOOM_MEETING_SDK_KEY",
  "ZOOM_MEETING_SDK_SECRET",
  "ZOOM_WEBHOOK_SECRET_TOKEN",
] as const;

export async function getIntegrationStatus() {
  let storageReachable = false;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }), { abortSignal: AbortSignal.timeout(5_000) });
    storageReachable = true;
  } catch {
    storageReachable = false; // never surface provider errors
  }
  return {
    zoom: {
      mode: env.ZOOM_MODE,
      vars: ZOOM_ENV_VARS.map((name) => ({ name, present: !!process.env[name] })),
    },
    storage: { reachable: storageReachable, bucket: env.S3_BUCKET },
    email: { smtpConfigured: !!env.SMTP_HOST, smtpHost: env.SMTP_HOST ? `${env.SMTP_HOST}:${env.SMTP_PORT}` : null },
    checkedAt: new Date(),
  };
}
