import "server-only";
import { z } from "zod";
import type { PublicationStatus } from "@/generated/prisma/enums";
import { effectiveMeetingStatus } from "@/server/access/policy";
import { MAX_REPEATED_LESSONS, repeatSchedules, validateLessonSchedule, type LessonSchedule, type RepeatRule, type ScheduleIssue } from "@/lib/admin/lesson-rules";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { ApiError } from "@/server/http";
import { publishLessonChanged } from "@/server/realtime/publish";
import { deleteObject } from "@/server/storage/storage";
import { deleteZoomMeeting, syncZoomMeetingSchedule } from "@/server/zoom/meetings";
import { audit } from "./audit";
import { assertActiveStudents, enrollStudents } from "./course-members";
import { markLessonEnded, markLessonLive, notifyLessonCancelled, notifyLessonRescheduled } from "./live";

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
  throwScheduleIssues(validateLessonSchedule(input, confirmEarlyDeadline));
  await assertCourse(input.courseId);
  assertDemoAllowed(input.isDemo);
  await assertActiveStudents([...new Set(studentIds)]); // checked first, so a bad list is refused before anything is created

  const lesson = await prisma.lesson.create({
    data: {
      title: input.title.trim(),
      summary: clean(input.summary),
      details: clean(input.details),
      courseId: input.courseId || null,
      scheduledStartAt: input.scheduledStartAt,
      scheduledEndAt: input.scheduledEndAt,
      joinOpensAt: input.joinOpensAt,
      accessExpiresAt: input.accessExpiresAt,
      isDemo: input.isDemo ?? false,
      // The demo classroom is always "provisioned"; real Zoom meetings are created in Phase 2.
      meetingStatus: input.isDemo ? "SCHEDULED" : "NOT_PROVISIONED",
      publication: "DRAFT",
      createdById: admin.id,
    },
    select: { id: true },
  });
  await audit(admin.id, "lesson.create", "lesson", lesson.id, { isDemo: input.isDemo ?? false });
  const { added } = await enrollStudents(lesson.id, studentIds, admin);
  return { ...lesson, enrolled: added };
}

/**
 * Creates a lesson and its repeats (same details and students, one lesson per date). Every
 * date is checked before anything is created; each lesson then gets its own Zoom meeting as usual.
 */
export async function createRepeatingLesson(input: LessonInput, repeat: RepeatRule, confirmEarlyDeadline: boolean, admin: AppUser, studentIds: string[] = []) {
  const schedules = repeatSchedules(input, repeat);
  if (schedules.length > MAX_REPEATED_LESSONS) throw new ApiError("VALIDATION_FAILED", `Mund të krijohen deri në ${MAX_REPEATED_LESSONS} mësime njëherësh. Zgjidhni një datë mbarimi më të afërt.`);
  for (const schedule of schedules) throwScheduleIssues(validateLessonSchedule(schedule, confirmEarlyDeadline));

  const created = [];
  for (const schedule of schedules) created.push(await createLesson({ ...input, ...schedule }, confirmEarlyDeadline, admin, studentIds));
  return { id: created[0].id, enrolled: created[0].enrolled, count: created.length };
}

export async function updateLesson(lessonId: string, patch: LessonPatch, confirmEarlyDeadline: boolean, admin: AppUser) {
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
  if (rescheduled && current.publication === "PUBLISHED" && schedule.scheduledEndAt.getTime() > Date.now()) {
    await notifyLessonRescheduled(lessonId, schedule.scheduledStartAt);
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

export async function setLessonPublication(lessonId: string, publication: PublicationStatus, admin: AppUser) {
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
  if (publication === "CANCELLED" && lesson.publication === "PUBLISHED" && lesson.scheduledEndAt.getTime() > Date.now()) {
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

/** Only drafts nobody is enrolled in can be deleted; everything else is archived instead. */
export async function deleteDraftLesson(lessonId: string, admin: AppUser) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      publication: true,
      title: true,
      zoomMeetingNumber: true,
      _count: { select: { enrollments: true } },
      materials: { select: { objectKey: true } },
      recordings: { select: { objectKey: true } },
    },
  });
  if (!lesson) throw new ApiError("NOT_FOUND", "Mësimi nuk u gjet.");
  if (lesson.publication !== "DRAFT") throw new ApiError("CONFLICT", "Vetëm draftet mund të fshihen. Arkivoni mësimin në vend të kësaj.");
  if (lesson._count.enrollments > 0) throw new ApiError("CONFLICT", "Mësimi ka studentë të regjistruar. Arkivoni mësimin në vend të kësaj.");

  const recordings = await prisma.recording.findMany({ where: { lessonId }, select: { id: true, uploadId: true } });
  if (recordings.some((r) => r.uploadId)) throw new ApiError("CONFLICT", "Një ngarkim regjistrimi është në vazhdim. Ndalojeni ose fshijeni fillimisht.");

  await deleteZoomMeeting(lessonId, lesson.zoomMeetingNumber, admin.id);
  await prisma.lesson.delete({ where: { id: lessonId } });
  const keys = [...lesson.materials.map((m) => m.objectKey), ...lesson.recordings.map((r) => r.objectKey)].filter((k): k is string => !!k);
  await Promise.all(keys.map((key) => deleteObject(key).catch((error) => console.error("[storage] orphan lesson object", key, error))));
  await audit(admin.id, "lesson.delete", "lesson", lessonId, { title: lesson.title });
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
