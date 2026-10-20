import "server-only";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/http";
import type { AppUser } from "@/server/auth/session";
import { checkCapability, evaluateLessonAccess, type Capability, type LessonAccess } from "./policy";

const lessonAccessSelect = {
  id: true,
  title: true,
  publication: true,
  meetingStatus: true,
  scheduledStartAt: true,
  scheduledEndAt: true,
  joinOpensAt: true,
  accessExpiresAt: true,
  isDemo: true,
} as const;

/**
 * Loads a lesson plus the viewer's enrolment in one query and enforces `capability`.
 * Throws a user-safe ApiError when denied; unknown lessons and lessons the student has
 * no relationship with are indistinguishable (non-disclosing 404).
 */
export async function requireLessonCapability(user: AppUser, lessonId: string, capability: Capability, now = new Date()) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      ...lessonAccessSelect,
      enrollments: {
        where: { userId: user.id },
        select: { accessExpiresAt: true, revokedAt: true },
        take: 1,
      },
    },
  });
  if (!lesson) throw new ApiError("LESSON_NOT_AVAILABLE", "Ky mësim nuk është i disponueshëm.");

  const { enrollments, ...lessonFields } = lesson;
  const access: LessonAccess = evaluateLessonAccess(user, lessonFields, enrollments[0] ?? null, now);
  const result = checkCapability(access, capability, lessonFields, now);
  if (!result.allowed) throw new ApiError(result.code, result.message);

  return { lesson: lessonFields, access };
}
