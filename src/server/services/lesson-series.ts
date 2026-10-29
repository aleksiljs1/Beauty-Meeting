import "server-only";
import type { PublicationStatus } from "@/generated/prisma/enums";
import { retimeSchedule } from "@/lib/admin/lesson-rules";
import { effectiveMeetingStatus } from "@/server/access/policy";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/http";
import { publishFeedChanged } from "@/server/realtime/publish";
import { createZoomMeetingForLesson } from "@/server/zoom/meetings";
import { audit } from "./audit";
import { enrollStudents } from "./course-members";
import { assertSchedules, deleteLessons, setLessonPublication, updateLesson } from "./lessons";
import { notifyLessonsChanged, studentsExpecting } from "./live";

/**
 * A lesson series: the dates of a repeating lesson, changed together. Bulk changes go through the
 * single-lesson functions (same rules, Zoom sync and audit), are checked for every date before
 * the first one changes, and tell each student once. They reach the dates still to come (not
 * over, not cancelled or archived); past dates stay as they happened.
 */

const ACTIVE: PublicationStatus[] = ["DRAFT", "PUBLISHED"];
const upcoming = (now: Date) => ({ scheduledEndAt: { gt: now }, publication: { in: ACTIVE } });

const lessonSelect = {
  id: true,
  publication: true,
  meetingStatus: true,
  isDemo: true,
  zoomMeetingNumber: true,
  scheduledStartAt: true,
  scheduledEndAt: true,
  joinOpensAt: true,
  accessExpiresAt: true,
} as const;

async function seriesLessons(seriesId: string, where: object) {
  const series = await prisma.lessonSeries.findUnique({
    where: { id: seriesId },
    select: { lessons: { where, orderBy: { scheduledStartAt: "asc" }, select: lessonSelect } },
  });
  if (!series) throw new ApiError("NOT_FOUND", "Seria nuk u gjet.");
  return series.lessons;
}

async function upcomingLessons(seriesId: string, now: Date) {
  const lessons = await seriesLessons(seriesId, upcoming(now));
  if (!lessons.length) throw new ApiError("CONFLICT", "Kjo seri nuk ka më mësime të ardhshme.");
  return lessons;
}

export type SeriesPatch = {
  title?: string;
  summary?: string | null;
  details?: string | null;
  courseId?: string | null;
  /** New Tirana start time ("HH:MM") and length for every upcoming date (both or neither). */
  time?: { start: string; durationMinutes: number };
};

export async function updateSeries(seriesId: string, patch: SeriesPatch, confirmEarlyDeadline: boolean, admin: AppUser, now = new Date()) {
  const lessons = await upcomingLessons(seriesId, now);
  const { time, ...fields } = patch;
  const changes = lessons.map((lesson) => ({ lesson, schedule: time ? retimeSchedule(lesson, time.start, time.durationMinutes) : null }));
  assertSchedules(changes.flatMap((c) => (c.schedule ? [c.schedule] : [])), confirmEarlyDeadline);

  let zoomSynced = true;
  for (const { lesson, schedule } of changes) {
    const result = await updateLesson(lesson.id, { ...fields, ...schedule }, confirmEarlyDeadline, admin, { notify: false });
    zoomSynced &&= result.zoomSynced;
  }
  const moved = changes.filter((c) => c.schedule && c.lesson.publication === "PUBLISHED" && c.schedule.scheduledStartAt.getTime() !== c.lesson.scheduledStartAt.getTime());
  if (moved.length) await notifyLessonsChanged("rescheduled", await studentsExpecting(moved.map((c) => c.lesson.id), now), { now });
  return { count: lessons.length, zoomSynced };
}

/** Publishes the upcoming drafts, or cancels every upcoming date (students hear once). */
export async function setSeriesPublication(seriesId: string, publication: "PUBLISHED" | "CANCELLED", admin: AppUser, now = new Date()) {
  const lessons = (await upcomingLessons(seriesId, now)).filter((l) => publication === "CANCELLED" || l.publication === "DRAFT");
  if (publication === "CANCELLED" && lessons.some((l) => effectiveMeetingStatus(l, now) === "LIVE")) {
    throw new ApiError("CONFLICT", "Një mësim i serisë është live. Përfundojeni fillimisht.");
  }
  const expecting = publication === "CANCELLED" ? await studentsExpecting(lessons.filter((l) => l.publication === "PUBLISHED").map((l) => l.id), now) : null;
  let zoomDeleted = true;
  for (const lesson of lessons) {
    const result = await setLessonPublication(lesson.id, publication, admin, { notify: false });
    zoomDeleted &&= result.zoomDeleted;
  }
  if (expecting) await notifyLessonsChanged("cancelled", expecting, { now });
  return { count: lessons.length, zoomDeleted };
}

/** Deletes the whole series, or only its dates that haven't ended yet. */
export async function deleteSeries(seriesId: string, admin: AppUser, { upcomingOnly = false, now = new Date() } = {}) {
  const lessons = await seriesLessons(seriesId, upcomingOnly ? { scheduledEndAt: { gt: now } } : {});
  return deleteLessons(lessons.map((l) => l.id), admin, now);
}

/** Enrols students in every upcoming date (restoring dates they'd been taken out of: an explicit choice). */
export async function addSeriesStudents(seriesId: string, userIds: string[], admin: AppUser, now = new Date()) {
  let added = 0;
  for (const lesson of await upcomingLessons(seriesId, now)) {
    const result = await enrollStudents(lesson.id, userIds, admin, { restoreRevoked: true });
    added += result.added + result.restored;
  }
  return { added };
}

/** Takes a student out of every upcoming date (past dates keep their access, as with a single revoke). */
export async function removeSeriesStudent(seriesId: string, userId: string, admin: AppUser, now = new Date()) {
  const lessons = await upcomingLessons(seriesId, now);
  const enrollments = await prisma.lessonEnrollment.findMany({
    where: { userId, revokedAt: null, lessonId: { in: lessons.map((l) => l.id) } },
    select: { id: true, lessonId: true },
  });
  const { count } = await prisma.lessonEnrollment.updateMany({ where: { id: { in: enrollments.map((e) => e.id) }, revokedAt: null }, data: { revokedAt: now } });
  for (const e of enrollments) await audit(admin.id, "enrollment.revoke", "lesson", e.lessonId, { enrollmentId: e.id, userId, via: "series" });
  if (count) await publishFeedChanged([userId]);
  return { removed: count };
}

/** Creates the Zoom meeting of every upcoming date that has none yet; reports how many failed. */
export async function createSeriesZoomMeetings(seriesId: string, admin: AppUser, now = new Date()) {
  const lessons = (await upcomingLessons(seriesId, now)).filter((l) => !l.isDemo && !l.zoomMeetingNumber);
  let failed = 0;
  for (const lesson of lessons) {
    try {
      await createZoomMeetingForLesson(lesson.id, admin);
    } catch (error) {
      failed += 1;
      console.error("[zoom] series meeting failed", { lessonId: lesson.id, error: (error as Error).message });
    }
  }
  return { created: lessons.length - failed, failed };
}
