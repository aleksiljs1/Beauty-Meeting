import "server-only";
import { auth } from "@/server/auth/auth";
import type { AppUser } from "@/server/auth/session";
import { Prisma } from "@/generated/prisma/client";
import { toDbDate } from "@/lib/datetime";
import type { StudentProfileInput } from "@/lib/student-profile";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/http";
import { publishFeedChanged } from "@/server/realtime/publish";
import { audit } from "./audit";
import { sendAccountSetupEmail } from "./accounts";

/** Administrator actions on existing student accounts (creation lives in accounts.ts). */

async function findStudent(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, role: true, banned: true } });
  if (!user || user.role !== "student") throw new ApiError("NOT_FOUND", "Studenti nuk u gjet.");
  return user;
}

export async function renameStudent(userId: string, name: string, admin: AppUser) {
  await findStudent(userId);
  await prisma.user.update({ where: { id: userId }, data: { name: name.trim() } });
  await audit(admin.id, "account.rename", "user", userId);
}

/** Saves the optional details; empty fields are stored as "not given". */
export async function saveStudentProfile(userId: string, input: StudentProfileInput, admin: AppUser) {
  await findStudent(userId);
  const data = {
    phone: input.phone || null,
    birthDate: input.birthDate ? toDbDate(input.birthDate) : null,
    gender: input.gender || null,
    city: input.city || null,
    notes: input.notes || null,
  };
  await prisma.studentProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  await audit(admin.id, "account.profile", "user", userId);
}

/** Corrects a student's email, invalidates old credentials/setup links, and sends a fresh setup link. */
export async function updateStudentEmail(userId: string, email: string, admin: AppUser) {
  const student = await findStudent(userId);
  const normalizedEmail = email.trim().toLowerCase();
  if (student.email.toLowerCase() === normalizedEmail) return { emailChanged: false, mailSent: false };

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } });
  if (existing && existing.id !== userId) throw new ApiError("CONFLICT", "Ekziston tashmë një llogari me këtë email.");

  try {
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { email: normalizedEmail, emailVerified: false, updatedAt: new Date() } }),
      prisma.session.deleteMany({ where: { userId } }),
      prisma.verification.deleteMany({ where: { value: userId } }),
    ]);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError("CONFLICT", "Ekziston tashmë një llogari me këtë email.");
    }
    throw error;
  }

  await audit(admin.id, "account.email_change", "user", userId, { emailChanged: true });
  await publishFeedChanged([userId]);

  let mailSent = false;
  if (!student.banned) {
    try {
      await sendAccountSetupEmail({ ...student, email: normalizedEmail });
      await audit(admin.id, "account.setup_email", "user", userId);
      mailSent = true;
    } catch (error) {
      console.error("[mail] setup email failed after email change", userId, error);
    }
  }
  return { emailChanged: true, mailSent };
}

/** Permanently removes a student and their dependent access records. */
export async function deleteStudent(userId: string, admin: AppUser) {
  if (userId === admin.id) throw new ApiError("FORBIDDEN", "Nuk mund të fshini llogarinë tuaj.");
  const student = await findStudent(userId);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.delete({ where: { id: userId } });
      await tx.auditLog.create({
        data: { actorId: admin.id, action: "account.delete", targetType: "user", targetId: userId, details: { deleted: true } },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new ApiError("CONFLICT", "Llogaria nuk mund të fshihet derisa të zgjidhen të dhënat që varen prej saj.");
    }
    throw error;
  }
  await publishFeedChanged([userId]);
  return { id: student.id, deleted: true };
}

/**
 * Deactivation = Better Auth "ban" plus deleting every session, so the student is signed out
 * everywhere at once (API calls already re-check `banned` on every request).
 *
 * Goes through Better Auth's internal adapter rather than `auth.api.banUser`, because that
 * endpoint requires an admin *cookie* session and our API is Bearer-only.
 */
export async function setStudentActive(userId: string, active: boolean, admin: AppUser) {
  if (userId === admin.id) throw new ApiError("FORBIDDEN", "Nuk mund të çaktivizoni llogarinë tuaj.");
  const student = await findStudent(userId);
  if (!!student.banned === !active) return; // already in the requested state

  const ctx = await auth.$context;
  if (active) {
    await ctx.internalAdapter.updateUser(userId, { banned: false, banReason: null, banExpires: null, updatedAt: new Date() });
  } else {
    await ctx.internalAdapter.updateUser(userId, { banned: true, banReason: "Deactivated by administrator", banExpires: null, updatedAt: new Date() });
    await ctx.internalAdapter.deleteUserSessions(userId);
  }
  // Open tabs refetch immediately (a deactivated student gets 401 and is signed out).
  await publishFeedChanged([userId]);
  await audit(admin.id, active ? "account.reactivate" : "account.deactivate", "user", userId);
}

export async function resendSetupEmail(userId: string, admin: AppUser) {
  const student = await findStudent(userId);
  if (student.banned) throw new ApiError("CONFLICT", "Llogaria është e çaktivizuar. Riaktivizojeni fillimisht.");
  try {
    await sendAccountSetupEmail(student);
  } catch (error) {
    console.error("[mail] setup email failed", userId, error);
    throw new ApiError("INTEGRATION_FAILED", "Emaili nuk u dërgua. Provoni përsëri më vonë.");
  }
  await audit(admin.id, "account.setup_email", "user", userId);
}
