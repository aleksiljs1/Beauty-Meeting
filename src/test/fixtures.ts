import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import type { AppUser } from "@/server/auth/session";

/** Test-database helpers. Only used by *.integration.test.ts against academy_test. */

export async function resetDatabase() {
  if (!process.env.DATABASE_URL?.includes("academy_test")) throw new Error("Refusing to reset a non-test database");
  await prisma.$executeRawUnsafe(
    `TRUNCATE "WebhookEvent", "Notification", "InvitationRedemption", "LessonInvitation", "LessonEnrollment", "LessonMaterial", "MaterialFile",
      "Recording", "Lesson", "Course", "AuditLog", "session", "account", "verification", "user" CASCADE`,
  );
}

export async function createUser(role: "admin" | "student", overrides: { banned?: boolean } = {}): Promise<AppUser> {
  const id = randomUUID();
  const user = await prisma.user.create({
    data: { id, name: `${role} ${id.slice(0, 6)}`, email: `${id}@test.local`, role, banned: overrides.banned ?? false },
  });
  return { id: user.id, name: user.name, email: user.email, role };
}

const HOUR = 3_600_000;

export async function createLesson(adminId: string, overrides: Partial<Prisma.LessonUncheckedCreateInput> = {}) {
  const start = new Date(Date.now() + 24 * HOUR);
  return prisma.lesson.create({
    data: {
      title: "Teknikat e ngjyrosjes",
      scheduledStartAt: start,
      scheduledEndAt: new Date(start.getTime() + 3 * HOUR),
      joinOpensAt: new Date(start.getTime() - 15 * 60_000),
      accessExpiresAt: new Date(start.getTime() + 30 * 24 * HOUR),
      publication: "PUBLISHED",
      meetingStatus: "SCHEDULED",
      createdById: adminId,
      ...overrides,
    },
  });
}
