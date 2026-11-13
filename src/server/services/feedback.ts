import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { END_GRACE_MS } from "@/server/access/policy";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/http";

/**
 * Student feedback: a 1-5 rating with an optional comment on a lesson that is over, on a course
 * that is over, or on the app itself. A lesson or course has one rating per student (sending it
 * again changes it); app feedback is a new entry each time.
 */

const HELD = ["PUBLISHED", "ARCHIVED"] as const;
const APP_FEEDBACK_PER_DAY = 10;

const rating = z.int().min(1).max(5);
const comment = z
  .string()
  .trim()
  .max(2000)
  .nullish()
  .transform((value) => value || null);

export const feedbackInputSchema = z.discriminatedUnion("topic", [
  z.object({ topic: z.literal("LESSON"), lessonId: z.uuid(), rating, comment }),
  z.object({ topic: z.literal("COURSE"), courseId: z.uuid(), rating, comment }),
  z.object({ topic: z.literal("APP"), rating, comment }),
]);
export type FeedbackInput = z.infer<typeof feedbackInputSchema>;

/**
 * The student's lessons (enrolment not revoked) that took place and are over: ended, or started
 * and past their end (a lost "ended" event; a class still live counts once its grace is over).
 * A lesson that never started (the teacher didn't come) isn't one to rate.
 */
export function rateableLessonsWhere(userId: string, now: Date): Prisma.LessonWhereInput {
  return {
    publication: { in: [...HELD] },
    enrollments: { some: { userId, revokedAt: null } },
    OR: [
      { meetingStatus: "ENDED" },
      { liveStartedAt: { not: null }, meetingStatus: { not: "LIVE" }, scheduledEndAt: { lte: now } },
      { meetingStatus: "LIVE", scheduledEndAt: { lte: new Date(now.getTime() - END_GRACE_MS) } },
    ],
  };
}

/** Courses that are over: at least one lesson held and none still to come. */
export function endedCoursesWhere(now: Date): Prisma.CourseWhereInput {
  return {
    AND: [
      { lessons: { some: { publication: { in: [...HELD] }, scheduledEndAt: { lte: now } } } },
      { lessons: { none: { publication: "PUBLISHED", scheduledEndAt: { gt: now } } } },
    ],
  };
}

/** Ended courses the student took part in. */
export function rateableCoursesWhere(userId: string, now: Date): Prisma.CourseWhereInput {
  return {
    AND: [endedCoursesWhere(now), { lessons: { some: { publication: { in: [...HELD] }, enrollments: { some: { userId, revokedAt: null } } } } }],
  };
}

const NOT_RATEABLE = "Ky vlerësim nuk mund të jepet tani.";

export async function submitFeedback(user: AppUser, input: FeedbackInput, now = new Date()) {
  if (user.role !== "student") throw new ApiError("FORBIDDEN", "Vetëm studentët japin vlerësime.");
  const values = { rating: input.rating, comment: input.comment };

  if (input.topic === "LESSON") {
    const allowed = await prisma.lesson.count({ where: { id: input.lessonId, ...rateableLessonsWhere(user.id, now) } });
    if (!allowed) throw new ApiError("CONFLICT", NOT_RATEABLE);
    return prisma.feedback.upsert({
      where: { userId_lessonId: { userId: user.id, lessonId: input.lessonId } },
      create: { userId: user.id, topic: "LESSON", lessonId: input.lessonId, ...values },
      update: values,
      select: { id: true },
    });
  }

  if (input.topic === "COURSE") {
    const allowed = await prisma.course.count({ where: { id: input.courseId, ...rateableCoursesWhere(user.id, now) } });
    if (!allowed) throw new ApiError("CONFLICT", NOT_RATEABLE);
    return prisma.feedback.upsert({
      where: { userId_courseId: { userId: user.id, courseId: input.courseId } },
      create: { userId: user.id, topic: "COURSE", courseId: input.courseId, ...values },
      update: values,
      select: { id: true },
    });
  }

  const sentToday = await prisma.feedback.count({
    where: { userId: user.id, topic: "APP", createdAt: { gt: new Date(now.getTime() - 86_400_000) } },
  });
  if (sentToday >= APP_FEEDBACK_PER_DAY) throw new ApiError("RATE_LIMITED", "Keni dërguar shumë mesazhe sot. Provoni përsëri nesër.");
  return prisma.feedback.create({ data: { userId: user.id, topic: "APP", ...values }, select: { id: true } });
}
