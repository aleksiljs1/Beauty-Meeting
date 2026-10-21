import "server-only";
import { auth } from "@/server/auth/auth";
import type { AppUser } from "@/server/auth/session";
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
