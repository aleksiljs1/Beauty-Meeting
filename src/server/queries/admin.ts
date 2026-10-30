import "server-only";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { Prisma } from "@/generated/prisma/client";
import type { PublicationStatus } from "@/generated/prisma/enums";
import { academyDay, weekdayIndex } from "@/lib/datetime";
import { toProfileInput, type StudentProfileInput } from "@/lib/student-profile";
import { END_GRACE_MS, effectiveMeetingStatus } from "@/server/access/policy";
import { prisma } from "@/server/db";
import { env, ZOOM_LIVE_VARIABLES } from "@/server/env";
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
  /** Null for a library file no lesson uses yet (the issue links to the library instead). */
  lessonId: string | null;
  lessonTitle: string | null;
  name: string | null;
  message: string | null;
  at: Date;
};

const issueFileSelect = { id: true, displayName: true, lessons: { take: 1, select: { lesson: { select: { id: true, title: true } } } } } as const;
const fileIssuePlace = (file: { lessons: { lesson: { id: string; title: string } }[] }) => ({
  lessonId: file.lessons[0]?.lesson.id ?? null,
  lessonTitle: file.lessons[0]?.lesson.title ?? null,
});

export async function getAdminDashboard(now = new Date()) {
  const stale = new Date(now.getTime() - HOUR);
  const [activeStudents, live, upcoming, upcomingCount, failedRecordings, stalledRecordings, failedMaterials, stalledMaterials] = await Promise.all([
    prisma.user.count({ where: activeStudentWhere }),
    prisma.lesson.findMany({
      // Same rule as effectiveMeetingStatus: a LIVE lesson is over END_GRACE_MS after its scheduled end.
      where: { meetingStatus: "LIVE", scheduledEndAt: { gt: new Date(now.getTime() - END_GRACE_MS) } },
      orderBy: { liveStartedAt: "desc" },
      select: dashboardLessonSelect,
      take: 10,
    }),
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
    prisma.materialFile.findMany({
      where: { status: "FAILED" },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { ...issueFileSelect, updatedAt: true },
    }),
    prisma.materialFile.findMany({
      where: { status: "PENDING", createdAt: { lt: stale } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { ...issueFileSelect, createdAt: true },
    }),
  ]);

  const issues: DashboardIssue[] = [
    ...failedRecordings.map((r) => ({ kind: "RECORDING_FAILED" as const, id: r.id, lessonId: r.lessonId, lessonTitle: r.lesson.title, name: r.displayName, message: r.errorMessage, at: r.updatedAt })),
    ...stalledRecordings.map((r) => ({ kind: "RECORDING_STALLED" as const, id: r.id, lessonId: r.lessonId, lessonTitle: r.lesson.title, name: r.displayName, message: null, at: r.updatedAt })),
    ...failedMaterials.map((m) => ({ kind: "MATERIAL_FAILED" as const, id: m.id, ...fileIssuePlace(m), name: m.displayName, message: null, at: m.updatedAt })),
    ...stalledMaterials.map((m) => ({ kind: "MATERIAL_STALLED" as const, id: m.id, ...fileIssuePlace(m), name: m.displayName, message: null, at: m.createdAt })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const toCard = ({ _count, ...lesson }: (typeof live)[number]) => ({ ...lesson, students: _count.enrollments });
  return { activeStudents, upcomingCount, live: live.map(toCard), upcoming: upcoming.map(toCard), issues };
}

// --- Students ------------------------------------------------------------------------------

function studentSearch(q?: string): Prisma.UserWhereInput {
  const term = q?.trim().slice(0, 100);
  return {
    role: "student",
    ...(term
      ? {
          OR: [
            { name: { contains: term, mode: "insensitive" } },
            { email: { contains: term, mode: "insensitive" } },
            { profile: { phone: { contains: term } } },
          ],
        }
      : {}),
  };
}

export type AdminStudentRow = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  hasPassword: boolean;
  enrollments: number;
  courses: { id: string; title: string }[];
  profile: StudentProfileInput;
  createdAt: Date;
};

export async function listStudents(params: { q?: string; page?: number; courseId?: string }): Promise<Paged<AdminStudentRow>> {
  const page = params.page ?? 1;
  const where: Prisma.UserWhereInput = {
    ...studentSearch(params.q),
    ...(params.courseId ? { courseMemberships: { some: { courseId: params.courseId } } } : {}),
  };
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
        courseMemberships: { orderBy: { course: { position: "asc" } }, select: { course: { select: { id: true, title: true } } } },
        profile: { select: { phone: true, birthDate: true, gender: true, city: true, notes: true } },
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
      courses: u.courseMemberships.map((m) => m.course),
      profile: toProfileInput(u.profile),
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

const lessonRowSelect = {
  id: true,
  title: true,
  scheduledStartAt: true,
  scheduledEndAt: true,
  accessExpiresAt: true,
  publication: true,
  meetingStatus: true,
  isDemo: true,
  seriesId: true,
  course: { select: { title: true } },
  _count: { select: { enrollments: { where: { revokedAt: null } } as const, materials: { where: { file: { status: "READY" as const } } } } },
} satisfies Prisma.LessonSelect;

const toLessonRow = ({ _count, course, ...lesson }: Prisma.LessonGetPayload<{ select: typeof lessonRowSelect }>, now: Date) => ({
  ...lesson,
  meetingStatus: effectiveMeetingStatus(lesson, now),
  courseTitle: course?.title ?? null,
  students: _count.enrollments,
  materials: _count.materials,
});
export type LessonRow = ReturnType<typeof toLessonRow>;

/** A repeating lesson shown as one entry: its dates that match the list filter. */
export type SeriesEntry = {
  id: string;
  title: string;
  courseTitle: string | null;
  isDemo: boolean;
  lessons: LessonRow[];
  /** Distinct weekdays of those dates, 0 = Monday. */
  weekdays: number[];
  /** First date still to come, if any. */
  next: LessonRow | null;
};

export type LessonListEntry = ({ kind: "lesson" } & LessonRow) | ({ kind: "series" } & SeriesEntry);

/** Lessons for the admin list; the dates of a series count (and page) as one entry. */
/** The lessons list's filter as a query condition (the list itself and its bulk delete). */
export function lessonFilterWhere(filter: Omit<LessonListFilter, "page">, now: Date): Prisma.LessonWhereInput {
  return {
    ...(filter.publication ? { publication: filter.publication } : {}),
    ...(filter.when === "upcoming" ? { scheduledEndAt: { gt: now } } : filter.when === "past" ? { scheduledEndAt: { lte: now } } : {}),
  };
}

/** How many lessons the bulk delete would take with this filter: only drafts, or all. */
export async function countFilteredLessons(filter: Omit<LessonListFilter, "page">, now = new Date()) {
  const where = lessonFilterWhere(filter, now);
  const [drafts, all] = await Promise.all([prisma.lesson.count({ where: { AND: [where, { publication: "DRAFT" }] } }), prisma.lesson.count({ where })]);
  return { drafts, all };
}

export async function listLessons(filter: LessonListFilter, now = new Date()): Promise<Paged<LessonListEntry>> {
  const page = Math.max(1, filter.page ?? 1);
  const where = lessonFilterWhere(filter, now);
  const conditions = [
    Prisma.sql`TRUE`,
    ...(filter.publication ? [Prisma.sql`"publication" = ${filter.publication}::"PublicationStatus"`] : []),
    ...(filter.when === "upcoming" ? [Prisma.sql`"scheduledEndAt" > ${now}`] : filter.when === "past" ? [Prisma.sql`"scheduledEndAt" <= ${now}`] : []),
  ];
  const whereSql = Prisma.join(conditions, " AND ");
  // Upcoming: soonest first. Otherwise newest first, a series by its latest matching date.
  const order = filter.when === "upcoming" ? Prisma.sql`MIN("scheduledStartAt") ASC` : Prisma.sql`MAX("scheduledStartAt") DESC`;
  const { skip, take } = pageArgs(page);
  const [keys, [{ total }]] = await Promise.all([
    prisma.$queryRaw<{ key: string }[]>`
      SELECT COALESCE("seriesId", "id")::text AS key FROM "Lesson" WHERE ${whereSql}
      GROUP BY 1 ORDER BY ${order}, 1 LIMIT ${take} OFFSET ${skip}`,
    prisma.$queryRaw<{ total: number }[]>`SELECT COUNT(DISTINCT COALESCE("seriesId", "id"))::int AS total FROM "Lesson" WHERE ${whereSql}`,
  ]);
  const ids = keys.map((k) => k.key);
  const rows = await prisma.lesson.findMany({
    where: { AND: [where, { OR: [{ id: { in: ids }, seriesId: null }, { seriesId: { in: ids } }] }] },
    orderBy: { scheduledStartAt: "asc" },
    select: lessonRowSelect,
  });
  const byKey = Map.groupBy(
    rows.map((row) => toLessonRow(row, now)),
    (row) => row.seriesId ?? row.id,
  );
  const items = ids.flatMap((key): LessonListEntry[] => {
    const lessons = byKey.get(key);
    if (!lessons) return [];
    if (!lessons[0].seriesId) return [{ kind: "lesson", ...lessons[0] }];
    return [{ kind: "series", ...toSeriesEntry(key, lessons, now) }];
  });
  return paged(items, total, page);
}

function toSeriesEntry(id: string, lessons: LessonRow[], now: Date): SeriesEntry {
  const next = lessons.find((l) => l.scheduledEndAt > now) ?? null;
  const shown = next ?? lessons.at(-1)!;
  return {
    id,
    title: shown.title,
    courseTitle: shown.courseTitle,
    isDemo: shown.isDemo,
    lessons,
    weekdays: [...new Set(lessons.map((l) => weekdayIndex(academyDay(l.scheduledStartAt))))].sort(),
    next,
  };
}

/** A series with all its dates, and the students of its upcoming dates. */
export async function getLessonSeries(seriesId: string, now = new Date()) {
  const series = await prisma.lessonSeries.findUnique({
    where: { id: seriesId },
    select: { id: true, createdAt: true, lessons: { orderBy: { scheduledStartAt: "asc" }, select: { ...lessonRowSelect, summary: true, details: true, courseId: true, joinOpensAt: true } } },
  });
  if (!series) return null;
  const lessons = series.lessons.map((lesson) => ({ ...toLessonRow(lesson, now), summary: lesson.summary, details: lesson.details, courseId: lesson.courseId, joinOpensAt: lesson.joinOpensAt }));
  const upcoming = lessons.filter((l) => l.scheduledEndAt > now && (l.publication === "DRAFT" || l.publication === "PUBLISHED"));
  const enrollments = await prisma.lessonEnrollment.findMany({
    where: { lessonId: { in: upcoming.map((l) => l.id) }, revokedAt: null },
    select: { user: { select: { id: true, name: true, email: true } } },
  });
  const students = [...Map.groupBy(enrollments, (e) => e.user.id).values()]
    .map((list) => ({ ...list[0].user, lessons: list.length }))
    .sort((a, b) => a.name.localeCompare(b.name, "sq"));
  return { ...toSeriesEntry(series.id, lessons, now), lessons, upcoming, students };
}
export type AdminLessonSeries = NonNullable<Awaited<ReturnType<typeof getLessonSeries>>>;

// --- Materials library -----------------------------------------------------------------------

export type LibraryFile = {
  id: string;
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  status: "PENDING" | "READY" | "FAILED";
  createdAt: Date;
  lessons: { id: string; title: string }[];
};

/** Library files, newest first, with the lessons that use them. */
export async function listMaterialLibrary({ q, readyOnly = false }: { q?: string; readyOnly?: boolean } = {}): Promise<LibraryFile[]> {
  const term = q?.trim().slice(0, 100);
  const rows = await prisma.materialFile.findMany({
    where: { ...(term ? { displayName: { contains: term, mode: "insensitive" } } : {}), ...(readyOnly ? { status: "READY" } : {}) },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      displayName: true,
      mimeType: true,
      sizeBytes: true,
      status: true,
      createdAt: true,
      lessons: { orderBy: { lesson: { scheduledStartAt: "desc" } }, select: { lesson: { select: { id: true, title: true } } } },
    },
  });
  return rows.map(({ lessons, sizeBytes, ...file }) => ({ ...file, sizeBytes: Number(sizeBytes), lessons: lessons.map((l) => l.lesson) }));
}

/** Lessons starting in [from, to) for the teachers' calendar; archived lessons are left out. */
export async function listCalendarLessons({ from, to, courseId }: { from: Date; to: Date; courseId?: string }) {
  const rows = await prisma.lesson.findMany({
    where: { scheduledStartAt: { gte: from, lt: to }, publication: { not: "ARCHIVED" }, ...(courseId ? { courseId } : {}) },
    orderBy: { scheduledStartAt: "asc" },
    take: 500,
    select: { id: true, title: true, scheduledStartAt: true, scheduledEndAt: true, publication: true, courseId: true, course: { select: { title: true } } },
  });
  return rows.map(({ course, ...lesson }) => ({ ...lesson, courseTitle: course?.title ?? null }));
}

/** `meetingStatus` is the effective one (see effectiveMeetingStatus), the same state students see. */
export async function getAdminLesson(lessonId: string, now = new Date()) {
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
      zoomMeetingNumber: true,
      createdAt: true,
      updatedAt: true,
      course: { select: { title: true } },
      series: { select: { id: true, _count: { select: { lessons: true } } } },
      _count: { select: { enrollments: { where: { revokedAt: null } } } },
    },
  });
  if (!lesson) return null;
  const { _count, course, series, ...rest } = lesson;
  return {
    ...rest,
    meetingStatus: effectiveMeetingStatus(lesson, now),
    courseTitle: course?.title ?? null,
    enrollmentCount: _count.enrollments,
    series: series ? { id: series.id, lessons: series._count.lessons } : null,
  };
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

  // Resolve readable target names in batched queries (no N+1).
  const ids = (type: string) => [...new Set(rows.filter((r) => r.targetType === type && r.targetId).map((r) => r.targetId!))];
  const [lessons, users, files] = await Promise.all([
    prisma.lesson.findMany({ where: { id: { in: ids("lesson").filter(isUuid) } }, select: { id: true, title: true } }),
    prisma.user.findMany({ where: { id: { in: ids("user") } }, select: { id: true, name: true } }),
    prisma.materialFile.findMany({ where: { id: { in: ids("material").filter(isUuid) } }, select: { id: true, displayName: true } }),
  ]);
  const names = new Map<string, string>([
    ...lessons.map((l) => [l.id, l.title] as const),
    ...users.map((u) => [u.id, u.name] as const),
    ...files.map((f) => [f.id, f.displayName] as const),
  ]);

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

/** Variables live Zoom needs — the same list the env schema enforces. Only presence is reported. */
export const ZOOM_ENV_VARS = ZOOM_LIVE_VARIABLES;

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
