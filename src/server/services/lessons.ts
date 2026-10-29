import "server-only";
import { z } from "zod";
import type { PublicationStatus } from "@/generated/prisma/enums";
import { effectiveMeetingStatus } from "@/server/access/policy";
import { MAX_REPEATED_LESSONS, repeatSchedules, validateLessonSchedule, type LessonSchedule, type RepeatRule, type ScheduleIssue } from "@/lib/admin/lesson-rules";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { ApiError } from "@/server/http";
import { publishFeedChanged, publishLessonChanged } from "@/server/realtime/publish";
import { deleteObject } from "@/server/storage/storage";
import { deleteZoomMeeting, syncZoomMeetingSchedule } from "@/server/zoom/meetings";
import { audit } from "./audit";
import { assertActiveStudents } from "./course-members";
import { markLessonEnded, markLessonLive, notifyLessonCancelled, notifyLessonRescheduled, notifyLessonsChanged, studentsExpecting } from "./live";

/**
 * Lesson administration: create/edit, publication lifecycle and the demo classroom controls.
 * Publication (DRAFT/PUBLISHED/ARCHIVED/CANCELLED) and meeting state (NOT_PROVISIONED/…/LIVE/
 * ENDED) are separate: publication is the admin's decision, LIVE comes only from a provider
 * event or the labelled demo simulation.
 */

export type LessonInput = {
  title: string;
  summary?: string | null;
  details?: string | null;
  courseId?: string | null;
  isDemo?: boolean;
} & LessonSchedule;

export type LessonPatch = Partial<LessonInput>;

/** Schedule problems surface as field issues; the early-deadline one drives a confirmation dialog. */
function throwScheduleIssues(issues: ScheduleIssue[]) {
  if (!issues.length) return;
  throw new z.ZodError(issues.map((issue) => ({ code: "custom" as const, path: [issue.path], message: issue.message, input: undefined })));
}

/** Checks several schedules before anything is written (a series is changed all or nothing). */
export function assertSchedules(schedules: LessonSchedule[], confirmEarlyDeadline: boolean) {
  for (const schedule of schedules) throwScheduleIssues(validateLessonSchedule(schedule, confirmEarlyDeadline));
}

const clean = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

async function assertCourse(courseId: string | null | undefined) {
  if (!courseId) return;
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
  if (!course) throw new ApiError("VALIDATION_FAILED", "Kursi nuk u gjet.");
}

function assertDemoAllowed(isDemo: boolean | undefined) {
  // A demo classroom only makes sense while Zoom runs in demo mode; never mix it into live Zoom.
  if (isDemo && env.ZOOM_MODE !== "demo") throw new ApiError("VALIDATION_FAILED", "Klasat demo lejohen vetëm në modalitetin demo.");
}

/** `studentIds`: students to enrol right away (the course's students, pre-selected in the form). */
export async function createLesson(input: LessonInput, confirmEarlyDeadline: boolean, admin: AppUser, studentIds: string[] = []) {
  const { id, enrolled } = await createLessons(input, [input], confirmEarlyDeadline, admin, studentIds);
  return { id, enrolled };
}

/** Creates a lesson and its repeats: one lesson per date, all with the same details and students. */
export async function createRepeatingLesson(input: LessonInput, repeat: RepeatRule, confirmEarlyDeadline: boolean, admin: AppUser, studentIds: string[] = []) {
  const schedules = repeatSchedules(input, repeat);
  if (schedules.length > MAX_REPEATED_LESSONS) throw new ApiError("VALIDATION_FAILED", `Mund të krijohen deri në ${MAX_REPEATED_LESSONS} mësime njëherësh. Zgjidhni një datë mbarimi më të afërt.`);
  return createLessons(input, schedules, confirmEarlyDeadline, admin, studentIds);
}

/**
 * All or nothing: every date and student is checked first, then the lessons, their enrolments and
 * audit entries are written in one transaction, so a failure (or a retry after one) never leaves
 * half a series behind.
 */
async function createLessons(input: LessonInput, schedules: LessonSchedule[], confirmEarlyDeadline: boolean, admin: AppUser, studentIds: string[]) {
  assertSchedules(schedules, confirmEarlyDeadline);
  await assertCourse(input.courseId);
  assertDemoAllowed(input.isDemo);
  const ids = [...new Set(studentIds)];
  await assertActiveStudents(ids);
  const members = new Set(
    input.courseId && ids.length
      ? (await prisma.courseMember.findMany({ where: { courseId: input.courseId, userId: { in: ids } }, select: { userId: true } })).map((m) => m.userId)
      : [],
  );
  const isDemo = input.isDemo ?? false;

  const lessons = await prisma.$transaction(async (tx) => {
    // Several dates are one series, so the admin can manage them together.
    const series = schedules.length > 1 ? await tx.lessonSeries.create({ data: { createdById: admin.id }, select: { id: true } }) : null;
    const created = await tx.lesson.createManyAndReturn({
      data: schedules.map(({ scheduledStartAt, scheduledEndAt, joinOpensAt, accessExpiresAt }) => ({
        title: input.title.trim(),
        summary: clean(input.summary),
        details: clean(input.details),
        courseId: input.courseId || null,
        scheduledStartAt,
        scheduledEndAt,
        joinOpensAt,
        accessExpiresAt,
        isDemo,
        // The demo classroom is always "provisioned"; real Zoom meetings are created in Phase 2.
        meetingStatus: isDemo ? "SCHEDULED" : "NOT_PROVISIONED",
        publication: "DRAFT",
        createdById: admin.id,
        seriesId: series?.id ?? null,
      })),
      select: { id: true, scheduledStartAt: true, seriesId: true },
    });
    const enrollments = created.flatMap((lesson) =>
      ids.map((userId) => ({ lessonId: lesson.id, userId, source: members.has(userId) ? ("COURSE" as const) : ("ADMIN" as const), grantedById: admin.id })),
    );
    await tx.lessonEnrollment.createMany({ data: enrollments });
    await tx.auditLog.createMany({
      data: [
        ...created.map((lesson) => ({ actorId: admin.id, action: "lesson.create", targetType: "lesson", targetId: lesson.id, details: { isDemo } })),
        ...enrollments.map((e) => ({ actorId: admin.id, action: "enrollment.grant", targetType: "lesson", targetId: e.lessonId, details: { userId: e.userId, via: e.source === "COURSE" ? "course" : "admin" } })),
      ],
    });
    return created.sort((a, b) => a.scheduledStartAt.getTime() - b.scheduledStartAt.getTime());
  });
  await publishFeedChanged(ids);
  return { id: lessons[0].id, seriesId: lessons[0].seriesId, enrolled: ids.length, count: lessons.length };
}

/** `notify: false` when the caller tells students itself (a whole series changing at once). */
export async function updateLesson(lessonId: string, patch: LessonPatch, confirmEarlyDeadline: boolean, admin: AppUser, { notify = true } = {}) {
  const current = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!current) throw new ApiError("NOT_FOUND", "Mësimi nuk u gjet.");

  const schedule: LessonSchedule = {
    scheduledStartAt: patch.scheduledStartAt ?? current.scheduledStartAt,
    scheduledEndAt: patch.scheduledEndAt ?? current.scheduledEndAt,
    joinOpensAt: patch.joinOpensAt ?? current.joinOpensAt,
    accessExpiresAt: patch.accessExpiresAt ?? current.accessExpiresAt,
  };
  throwScheduleIssues(validateLessonSchedule(schedule, confirmEarlyDeadline));
  if (patch.courseId !== undefined) await assertCourse(patch.courseId);

  let meetingStatus = current.meetingStatus;
  if (patch.isDemo !== undefined && patch.isDemo !== current.isDemo) {
    if (effectiveMeetingStatus(current, new Date()) === "LIVE") throw new ApiError("CONFLICT", "Nuk mund të ndryshoni llojin e klasës ndërsa mësimi është live.");
    if (patch.isDemo && current.zoomMeetingNumber) throw new ApiError("CONFLICT", "Ky mësim ka një takim Zoom. Anulojeni mësimin për ta fshirë takimin.");
    assertDemoAllowed(patch.isDemo);
    if (patch.isDemo && current.meetingStatus === "NOT_PROVISIONED") meetingStatus = "SCHEDULED";
    if (!patch.isDemo && current.meetingStatus === "SCHEDULED") meetingStatus = "NOT_PROVISIONED";
  }

  const changed = Object.keys(patch).filter((key) => {
    const raw = patch[key as keyof LessonPatch];
    const next = key === "summary" || key === "details" ? clean(raw as string | null | undefined) : raw;
    const prev = current[key as keyof typeof current];
    if (next instanceof Date && prev instanceof Date) return next.getTime() !== prev.getTime();
    return next !== undefined && (next ?? null) !== (prev ?? null);
  });

  await prisma.lesson.update({
    where: { id: lessonId },
    data: {
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.summary !== undefined ? { summary: clean(patch.summary) } : {}),
      ...(patch.details !== undefined ? { details: clean(patch.details) } : {}),
      ...(patch.courseId !== undefined ? { courseId: patch.courseId || null } : {}),
      ...(patch.isDemo !== undefined ? { isDemo: patch.isDemo } : {}),
      ...schedule,
      meetingStatus,
    },
  });
  // Field names only — never values (details may hold private lesson content).
  if (changed.length) {
    await audit(admin.id, "lesson.update", "lesson", lessonId, { fields: changed });
    await publishLessonChanged(lessonId);
  }

  // Students who can see the lesson hear about a new time, as long as the lesson isn't over.
  const rescheduled = changed.includes("scheduledStartAt") || changed.includes("scheduledEndAt");
  if (notify && rescheduled && current.publication === "PUBLISHED" && schedule.scheduledEndAt.getTime() > Date.now()) {
    await notifyLessonRescheduled(lessonId);
  }

  // Keep the Zoom meeting's title/time in step. Best effort: the lesson is already saved.
  const zoomRelevant = changed.some((key) => key === "title" || key === "scheduledStartAt" || key === "scheduledEndAt");
  if (!zoomRelevant || !current.zoomMeetingNumber) return { zoomSynced: true };
  const { synced } = await syncZoomMeetingSchedule(
    { id: lessonId, title: patch.title?.trim() ?? current.title, ...schedule, zoomMeetingNumber: current.zoomMeetingNumber },
    admin.id,
  );
  return { zoomSynced: synced };
}

const PUBLICATION_ACTION: Record<PublicationStatus, string> = {
  PUBLISHED: "lesson.publish",
  DRAFT: "lesson.unpublish",
  CANCELLED: "lesson.cancel",
  ARCHIVED: "lesson.archive",
};

/** Allowed transitions. Cancelled and archived lessons can be brought back as drafts. */
const TRANSITIONS: Record<PublicationStatus, PublicationStatus[]> = {
  DRAFT: ["PUBLISHED", "CANCELLED", "ARCHIVED"],
  PUBLISHED: ["DRAFT", "CANCELLED", "ARCHIVED"],
  CANCELLED: ["DRAFT", "ARCHIVED"],
  ARCHIVED: ["DRAFT"],
};

/** `notify: false` when the caller tells students itself (a whole series changing at once). */
export async function setLessonPublication(lessonId: string, publication: PublicationStatus, admin: AppUser, { notify = true } = {}) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { publication: true, meetingStatus: true, scheduledEndAt: true, zoomMeetingNumber: true },
  });
  if (!lesson) throw new ApiError("NOT_FOUND", "Mësimi nuk u gjet.");
  if (lesson.publication === publication) return { zoomDeleted: true };
  if (!TRANSITIONS[lesson.publication].includes(publication)) throw new ApiError("CONFLICT", "Ky ndryshim statusi nuk lejohet.");
  if (effectiveMeetingStatus(lesson, new Date()) === "LIVE" && publication !== "PUBLISHED") {
    throw new ApiError("CONFLICT", "Përfundoni fillimisht mësimin live.");
  }

  // Conditional update: a concurrent change in between can't be silently overwritten.
  const result = await prisma.lesson.updateMany({ where: { id: lessonId, publication: lesson.publication }, data: { publication } });
  if (result.count === 0) throw new ApiError("CONFLICT", "Mësimi u ndryshua ndërkohë. Rifreskoni faqen.");
  await audit(admin.id, PUBLICATION_ACTION[publication], "lesson", lessonId, { from: lesson.publication });
  // Students only knew about it if it was published; a lesson that's already over needs no notice.
  if (notify && publication === "CANCELLED" && lesson.publication === "PUBLISHED" && lesson.scheduledEndAt.getTime() > Date.now()) {
    await notifyLessonCancelled(lessonId);
  } else {
    await publishLessonChanged(lessonId);
  }

  // A cancelled lesson's Zoom meeting is removed so nobody can still join it from Zoom.
  if (publication !== "CANCELLED" || !lesson.zoomMeetingNumber) return { zoomDeleted: true };
  const { deleted } = await deleteZoomMeeting(lessonId, lesson.zoomMeetingNumber, admin.id);
  if (deleted) {
    await prisma.lesson.update({
      where: { id: lessonId },
      data: { zoomMeetingNumber: null, zoomPasscodeEncrypted: null, zoomJoinUrlEncrypted: null, meetingStatus: "NOT_PROVISIONED" },
    });
  }
  return { zoomDeleted: deleted };
}

/** Deletes one lesson; see `deleteLessons`. */
export async function deleteLesson(lessonId: string, admin: AppUser) {
  const { count } = await deleteLessons([lessonId], admin);
  if (!count) throw new ApiError("NOT_FOUND", "Mësimi nuk u gjet.");
}

/**
 * Deletes lessons for good, whatever their state, with their enrolments and recordings (their
 * materials stay in the library). Nothing is deleted while one of them is live or has a
 * recording upload running. Students still expecting a published lesson get one email about it.
 */
export async function deleteLessons(lessonIds: string[], admin: AppUser, now = new Date()) {
  const lessons = await prisma.lesson.findMany({
    where: { id: { in: lessonIds } },
    select: {
      id: true,
      title: true,
      publication: true,
      meetingStatus: true,
      scheduledEndAt: true,
      zoomMeetingNumber: true,
      seriesId: true,
      recordings: { select: { objectKey: true, uploadId: true } },
      enrollments: { where: { revokedAt: null }, select: { userId: true } },
    },
  });
  if (lessons.some((l) => effectiveMeetingStatus(l, now) === "LIVE")) throw new ApiError("CONFLICT", "Një mësim është live. Përfundojeni fillimisht.");
  if (lessons.some((l) => l.recordings.some((r) => r.uploadId))) {
    throw new ApiError("CONFLICT", "Një ngarkim regjistrimi është në vazhdim. Ndalojeni ose fshijeni fillimisht.");
  }

  const expecting = await studentsExpecting(lessons.filter((l) => l.publication === "PUBLISHED" && l.scheduledEndAt > now).map((l) => l.id), now);
  for (const lesson of lessons) await deleteZoomMeeting(lesson.id, lesson.zoomMeetingNumber, admin.id);
  await prisma.lesson.deleteMany({ where: { id: { in: lessons.map((l) => l.id) } } });
  const seriesIds = [...new Set(lessons.flatMap((l) => (l.seriesId ? [l.seriesId] : [])))];
  await prisma.lessonSeries.deleteMany({ where: { id: { in: seriesIds }, lessons: { none: {} } } }); // its last date just went

  const keys = lessons.flatMap((l) => l.recordings.map((r) => r.objectKey)).filter((k): k is string => !!k);
  await Promise.all(keys.map((key) => deleteObject(key).catch((error) => console.error("[storage] orphan lesson object", key, error))));
  await prisma.auditLog.createMany({
    data: lessons.map((l) => ({ actorId: admin.id, action: "lesson.delete", targetType: "lesson", targetId: l.id, details: { title: l.title, publication: l.publication } })),
  });
  await publishFeedChanged(lessons.flatMap((l) => l.enrollments.map((e) => e.userId)));
  await notifyLessonsChanged("cancelled", expecting, { lessonsKept: false, now });
  return { count: lessons.length };
}

/**
 * The admin ends a class the site still shows as live, e.g. when Zoom's "meeting ended" event
 * never arrived. Only our state changes: a meeting still open in Zoom must be closed there.
 */
export async function endLiveLesson(lessonId: string, admin: AppUser) {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { meetingStatus: true } });
  if (!lesson) throw new ApiError("NOT_FOUND", "Mësimi nuk u gjet.");
  if (lesson.meetingStatus !== "LIVE") throw new ApiError("CONFLICT", "Mësimi nuk është live.");
  await markLessonEnded(lessonId, "admin", admin.id);
}

// --- Demo classroom (ZOOM_MODE=demo, isDemo lessons only) -------------------------------

export async function runDemoAction(lessonId: string, action: "live" | "end" | "reset", admin: AppUser) {
  if (env.ZOOM_MODE !== "demo") throw new ApiError("FORBIDDEN", "Simulimi lejohet vetëm në modalitetin demo.");
  if (action === "live") return markLessonLive(lessonId, "demo", admin.id);
  if (action === "end") return markLessonEnded(lessonId, "demo", admin.id);

  // Reset so the demo can be shown again. Never touches non-demo lessons.
  const result = await prisma.lesson.updateMany({
    where: { id: lessonId, isDemo: true, meetingStatus: { not: "LIVE" } },
    data: { meetingStatus: "SCHEDULED", liveStartedAt: null, liveEndedAt: null },
  });
  if (result.count === 0) throw new ApiError("CONFLICT", "Klasa demo nuk mund të rivendoset tani.");
  await audit(admin.id, "lesson.demo_reset", "lesson", lessonId);
  await publishLessonChanged(lessonId);
}
