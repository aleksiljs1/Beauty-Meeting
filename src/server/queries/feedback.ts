import "server-only";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { endedCoursesWhere, rateableCoursesWhere, rateableLessonsWhere } from "@/server/services/feedback";

/** Reads for the feedback pages. Dates are ISO strings so they can go to Client Components. */

export type OwnFeedback = { rating: number; comment: string | null } | null;

/** Lessons stay on the student's feedback page this long after they end, unless already rated. */
const PENDING_DAYS = 30;
const DAY = 86_400_000;

const own = (rows: { rating: number; comment: string | null }[]): OwnFeedback => (rows[0] ? { rating: rows[0].rating, comment: rows[0].comment } : null);

// ---------------------------------------------------------------------------
// Student
// ---------------------------------------------------------------------------

export async function getStudentFeedback(user: AppUser, now = new Date()) {
  const ownFeedback = { where: { userId: user.id }, select: { rating: true, comment: true }, take: 1 } as const;
  const [lessons, courses] = await Promise.all([
    prisma.lesson.findMany({
      where: {
        AND: [rateableLessonsWhere(user.id, now), { OR: [{ scheduledStartAt: { gte: new Date(now.getTime() - PENDING_DAYS * DAY) } }, { feedback: { some: { userId: user.id } } }] }],
      },
      orderBy: { scheduledStartAt: "desc" },
      take: 50,
      select: { id: true, title: true, scheduledStartAt: true, course: { select: { title: true } }, feedback: ownFeedback },
    }),
    prisma.course.findMany({
      where: rateableCoursesWhere(user.id, now),
      orderBy: { title: "asc" },
      take: 20,
      select: { id: true, title: true, feedback: ownFeedback },
    }),
  ]);
  return {
    lessons: lessons.map((l) => ({ id: l.id, title: l.title, courseTitle: l.course?.title ?? null, startsAt: l.scheduledStartAt.toISOString(), feedback: own(l.feedback) })),
    courses: courses.map((c) => ({ id: c.id, title: c.title, feedback: own(c.feedback) })),
  };
}

/** How many recent lessons and ended courses the student hasn't rated yet (dashboard reminder). */
export async function countPendingFeedback(user: AppUser, now = new Date()) {
  const unrated = { feedback: { none: { userId: user.id } } };
  const [lessons, courses] = await Promise.all([
    prisma.lesson.count({ where: { AND: [rateableLessonsWhere(user.id, now), unrated, { scheduledStartAt: { gte: new Date(now.getTime() - PENDING_DAYS * DAY) } }] } }),
    prisma.course.count({ where: { AND: [rateableCoursesWhere(user.id, now), unrated] } }),
  ]);
  return lessons + courses;
}

/** The student's rating of one lesson, or `undefined` when the lesson can't be rated (yet). */
export async function getOwnLessonFeedback(user: AppUser, lessonId: string, now = new Date()): Promise<OwnFeedback | undefined> {
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, ...rateableLessonsWhere(user.id, now) },
    select: { feedback: { where: { userId: user.id }, select: { rating: true, comment: true }, take: 1 } },
  });
  return lesson ? own(lesson.feedback) : undefined;
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

const entrySelect = { id: true, rating: true, comment: true, updatedAt: true, user: { select: { name: true } } } as const;

export type FeedbackEntry = { id: string; rating: number; comment: string | null; at: string; studentName: string };

const toEntry = (row: { id: string; rating: number; comment: string | null; updatedAt: Date; user: { name: string } }): FeedbackEntry => ({
  id: row.id,
  rating: row.rating,
  comment: row.comment,
  at: row.updatedAt.toISOString(),
  studentName: row.user.name,
});

export type RatingSummary = { average: number | null; count: number };

export function summarize(entries: { rating: number }[]): RatingSummary {
  if (!entries.length) return { average: null, count: 0 };
  return { average: entries.reduce((sum, e) => sum + e.rating, 0) / entries.length, count: entries.length };
}

/** Ended courses, most recently finished first, with their course and lesson ratings. */
export async function listEndedCourseFeedback(now = new Date()) {
  const courses = await prisma.course.findMany({
    where: endedCoursesWhere(now),
    select: {
      id: true,
      title: true,
      feedback: { select: { rating: true } },
      lessons: {
        where: { publication: { in: ["PUBLISHED", "ARCHIVED"] } },
        orderBy: { scheduledEndAt: "desc" },
        select: { scheduledEndAt: true, feedback: { select: { rating: true } } },
      },
    },
  });
  return courses
    .map((c) => ({
      id: c.id,
      title: c.title,
      endedAt: c.lessons[0]?.scheduledEndAt.toISOString() ?? null,
      course: summarize(c.feedback),
      lessons: summarize(c.lessons.flatMap((l) => l.feedback)),
    }))
    .sort((a, b) => (b.endedAt ?? "").localeCompare(a.endedAt ?? ""));
}

const lessonWithFeedbackSelect = {
  id: true,
  title: true,
  scheduledStartAt: true,
  feedback: { orderBy: { updatedAt: "desc" }, select: entrySelect },
} as const;

type LessonRow = { id: string; title: string; scheduledStartAt: Date; feedback: Parameters<typeof toEntry>[0][] };
const toLesson = (l: LessonRow) => {
  const entries = l.feedback.map(toEntry);
  return { id: l.id, title: l.title, startsAt: l.scheduledStartAt.toISOString(), summary: summarize(entries), entries };
};

/** One course: what students said about the whole course and about each of its lessons. */
export async function getCourseFeedback(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      title: true,
      feedback: { orderBy: { updatedAt: "desc" }, select: entrySelect },
      lessons: { where: { publication: { in: ["PUBLISHED", "ARCHIVED"] } }, orderBy: { scheduledStartAt: "asc" }, select: lessonWithFeedbackSelect },
    },
  });
  if (!course) return null;
  const entries = course.feedback.map(toEntry);
  return { id: course.id, title: course.title, summary: summarize(entries), entries, lessons: course.lessons.map(toLesson) };
}

/** Rated lessons outside the ended courses (no course, or a course still running), newest first. */
export async function listOtherLessonFeedback(now = new Date()) {
  const lessons = await prisma.lesson.findMany({
    where: { feedback: { some: {} }, OR: [{ courseId: null }, { course: { NOT: endedCoursesWhere(now) } }] },
    orderBy: { scheduledStartAt: "desc" },
    take: 100,
    select: { ...lessonWithFeedbackSelect, course: { select: { title: true } } },
  });
  return lessons.map((l) => ({ ...toLesson(l), courseTitle: l.course?.title ?? null }));
}

/** Feedback on the app itself, newest first. */
export async function listAppFeedback() {
  const rows = await prisma.feedback.findMany({ where: { topic: "APP" }, orderBy: { createdAt: "desc" }, take: 200, select: entrySelect });
  return rows.map(toEntry);
}
