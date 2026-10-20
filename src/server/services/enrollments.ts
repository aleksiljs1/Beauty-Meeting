import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/http";
import { publishFeedChanged } from "@/server/realtime/publish";
import { audit } from "./audit";

/**
 * Administrator enrolment management. Access itself is always decided by the central policy
 * (src/server/access/policy.ts); this module only changes the enrolment rows it reads:
 * grant, revoke, re-grant and a per-student deadline that can only shorten access.
 */

async function findEnrollment(enrollmentId: string) {
  const enrollment = await prisma.lessonEnrollment.findUnique({
    where: { id: enrollmentId },
    select: { id: true, lessonId: true, userId: true, revokedAt: true, accessExpiresAt: true, lesson: { select: { accessExpiresAt: true } } },
  });
  if (!enrollment) throw new ApiError("NOT_FOUND", "Regjistrimi nuk u gjet.");
  return enrollment;
}

function assertDeadlineShortens(deadline: Date | null, lessonDeadline: Date) {
  if (deadline && deadline.getTime() > lessonDeadline.getTime()) {
    throw new ApiError("VALIDATION_FAILED", "Afati personal nuk mund të jetë pas afatit të mësimit — ai mund vetëm ta shkurtojë aksesin.");
  }
}

/** Adds an existing, active student to a lesson. A previously revoked enrolment is re-granted. */
export async function grantEnrollment(lessonId: string, userId: string, admin: AppUser, accessExpiresAt: Date | null = null) {
  const [lesson, student] = await Promise.all([
    prisma.lesson.findUnique({ where: { id: lessonId }, select: { accessExpiresAt: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { role: true, banned: true } }),
  ]);
  if (!lesson) throw new ApiError("NOT_FOUND", "Mësimi nuk u gjet.");
  if (!student || student.role !== "student") throw new ApiError("NOT_FOUND", "Studenti nuk u gjet.");
  if (student.banned) throw new ApiError("CONFLICT", "Llogaria e studentit është e çaktivizuar.");
  assertDeadlineShortens(accessExpiresAt, lesson.accessExpiresAt);

  const existing = await prisma.lessonEnrollment.findUnique({
    where: { lessonId_userId: { lessonId, userId } },
    select: { id: true, revokedAt: true },
  });
  if (existing && !existing.revokedAt) throw new ApiError("CONFLICT", "Studenti është tashmë i regjistruar në këtë mësim.");
  if (existing) return restoreEnrollment(existing.id, admin);

  try {
    const created = await prisma.lessonEnrollment.create({
      data: { lessonId, userId, source: "ADMIN", grantedById: admin.id, accessExpiresAt },
      select: { id: true },
    });
    await audit(admin.id, "enrollment.grant", "lesson", lessonId, { enrollmentId: created.id, userId });
    await publishFeedChanged([userId]);
    return created;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError("CONFLICT", "Studenti është tashmë i regjistruar në këtë mësim.");
    }
    throw error;
  }
}

export async function revokeEnrollment(enrollmentId: string, admin: AppUser) {
  const enrollment = await findEnrollment(enrollmentId);
  const result = await prisma.lessonEnrollment.updateMany({ where: { id: enrollmentId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (result.count === 0) return { id: enrollmentId }; // already revoked — idempotent
  await audit(admin.id, "enrollment.revoke", "lesson", enrollment.lessonId, { enrollmentId, userId: enrollment.userId });
  await publishFeedChanged([enrollment.userId]);
  return { id: enrollmentId };
}

/** Re-grant: clears the revocation. The student's own deadline (if any) is kept. */
export async function restoreEnrollment(enrollmentId: string, admin: AppUser) {
  const enrollment = await findEnrollment(enrollmentId);
  const result = await prisma.lessonEnrollment.updateMany({
    where: { id: enrollmentId, revokedAt: { not: null } },
    data: { revokedAt: null, grantedById: admin.id },
  });
  if (result.count === 0) return { id: enrollmentId };
  await audit(admin.id, "enrollment.regrant", "lesson", enrollment.lessonId, { enrollmentId, userId: enrollment.userId });
  await publishFeedChanged([enrollment.userId]);
  return { id: enrollmentId };
}

/** Sets (or clears with null) the student's own deadline. It can never extend past the lesson deadline. */
export async function setEnrollmentDeadline(enrollmentId: string, deadline: Date | null, admin: AppUser) {
  const enrollment = await findEnrollment(enrollmentId);
  assertDeadlineShortens(deadline, enrollment.lesson.accessExpiresAt);
  await prisma.lessonEnrollment.update({ where: { id: enrollmentId }, data: { accessExpiresAt: deadline } });
  await audit(admin.id, deadline ? "enrollment.deadline_set" : "enrollment.deadline_clear", "lesson", enrollment.lessonId, {
    enrollmentId,
    userId: enrollment.userId,
    ...(deadline ? { deadline: deadline.toISOString() } : {}),
  });
  await publishFeedChanged([enrollment.userId]);
  return { id: enrollmentId };
}
