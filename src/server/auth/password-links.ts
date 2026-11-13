import "server-only";
import { prisma } from "@/server/db";

/**
 * Setup and reset links are Better Auth reset-password tokens: verification rows whose value is
 * the user's id (the identifier is hashed). Only the newest link may work, and none once the
 * password is set: otherwise a second email, or a forgotten older one, could still change it.
 */
export async function revokePasswordLinks(userId: string, { keepNewest = false } = {}) {
  const newest = keepNewest
    ? await prisma.verification.findFirst({ where: { value: userId }, orderBy: { createdAt: "desc" }, select: { id: true } })
    : null;
  await prisma.verification.deleteMany({ where: { value: userId, ...(newest && { id: { not: newest.id } }) } });
}
