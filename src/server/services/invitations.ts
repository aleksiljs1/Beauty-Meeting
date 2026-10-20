import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { isExpired } from "@/server/access/policy";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { ApiError } from "@/server/http";
import { audit } from "./audit";

/**
 * One shared invitation link per lesson (sent to the whole class). It never replaces login:
 * a signed-in student explicitly redeems it to get an enrolment. Only the SHA-256 of the
 * token is stored; the plaintext link is shown to the administrator once, at creation.
 */

export const hashInvitationToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function invitationUrl(token: string) {
  return new URL(`/ftese/${token}`, env.APP_URL).toString();
}

export async function createInvitation(
  input: { lessonId: string; redeemUntil: Date; accessExpiresAt?: Date | null; maxRedemptions?: number | null; email?: string | null },
  actor: AppUser,
  now = new Date(),
) {
  const lesson = await prisma.lesson.findUnique({ where: { id: input.lessonId }, select: { accessExpiresAt: true } });
  if (!lesson) throw new ApiError("NOT_FOUND", "Mësimi nuk u gjet.");
  if (input.redeemUntil.getTime() <= now.getTime()) throw new ApiError("VALIDATION_FAILED", "Afati i ftesës duhet të jetë në të ardhmen.");
  if (input.redeemUntil.getTime() > lesson.accessExpiresAt.getTime()) {
    throw new ApiError("VALIDATION_FAILED", "Ftesa nuk mund të vlejë pas afatit të aksesit të mësimit.");
  }
  if (input.accessExpiresAt && input.accessExpiresAt.getTime() > lesson.accessExpiresAt.getTime()) {
    throw new ApiError("VALIDATION_FAILED", "Afati i aksesit nuk mund të jetë pas afatit të mësimit.");
  }

  const token = randomBytes(32).toString("base64url");
  const invitation = await prisma.lessonInvitation.create({
    data: {
      lessonId: input.lessonId,
      tokenHash: hashInvitationToken(token),
      redeemUntil: input.redeemUntil,
      accessExpiresAt: input.accessExpiresAt ?? null,
      maxRedemptions: input.maxRedemptions ?? null,
      email: input.email?.trim().toLowerCase() || null,
      createdById: actor.id,
    },
    select: { id: true },
  });
  await audit(actor.id, "invitation.create", "lesson", input.lessonId, { invitationId: invitation.id, maxRedemptions: input.maxRedemptions ?? null });
  return { id: invitation.id, url: invitationUrl(token) };
}

export async function revokeInvitation(invitationId: string, actor: AppUser) {
  const result = await prisma.lessonInvitation.updateMany({ where: { id: invitationId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (result.count === 0) throw new ApiError("NOT_FOUND", "Ftesa nuk u gjet ose është anuluar tashmë.");
  await audit(actor.id, "invitation.revoke", "invitation", invitationId);
}

export type InvitationState = "VALID" | "ALREADY_ENROLLED" | "EXPIRED" | "REVOKED" | "FULL" | "WRONG_ACCOUNT" | "ACCESS_REVOKED" | "LESSON_UNAVAILABLE";

const MESSAGES: Record<Exclude<InvitationState, "VALID" | "ALREADY_ENROLLED">, string> = {
  EXPIRED: "Kjo ftesë ka skaduar.",
  REVOKED: "Kjo ftesë nuk është më aktive.",
  FULL: "Të gjitha vendet për këtë ftesë janë zënë.",
  WRONG_ACCOUNT: "Kjo ftesë është për një llogari tjetër.",
  ACCESS_REVOKED: "Aksesi juaj në këtë mësim është hequr. Kontaktoni akademinë.",
  LESSON_UNAVAILABLE: "Ky mësim nuk është i disponueshëm.",
};

type InvitationRow = Prisma.LessonInvitationGetPayload<{
  include: { lesson: { select: { id: true; title: true; scheduledStartAt: true; scheduledEndAt: true; publication: true; accessExpiresAt: true } } };
}>;

async function findByToken(token: string): Promise<InvitationRow | null> {
  if (token.length < 20 || token.length > 100) return null;
  return prisma.lessonInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    include: {
      lesson: { select: { id: true, title: true, scheduledStartAt: true, scheduledEndAt: true, publication: true, accessExpiresAt: true } },
    },
  });
}

function evaluate(invitation: InvitationRow, user: AppUser, enrollment: { revokedAt: Date | null } | null, now: Date): InvitationState {
  if (enrollment?.revokedAt) return "ACCESS_REVOKED";
  if (enrollment) return "ALREADY_ENROLLED";
  if (invitation.revokedAt) return "REVOKED";
  if (invitation.lesson.publication !== "PUBLISHED" || isExpired(invitation.lesson.accessExpiresAt, now)) return "LESSON_UNAVAILABLE";
  if (isExpired(invitation.redeemUntil, now)) return "EXPIRED";
  if (invitation.email && invitation.email !== user.email.toLowerCase()) return "WRONG_ACCOUNT";
  if (invitation.maxRedemptions !== null && invitation.redemptionCount >= invitation.maxRedemptions) return "FULL";
  return "VALID";
}

/** Read-only: safe for GET requests, link previews and email scanners. Never consumes anything. */
export async function previewInvitation(token: string, user: AppUser, now = new Date()) {
  const invitation = await findByToken(token);
  if (!invitation) throw new ApiError("NOT_FOUND", "Kjo ftesë nuk është e vlefshme.");
  const enrollment = await prisma.lessonEnrollment.findUnique({
    where: { lessonId_userId: { lessonId: invitation.lessonId, userId: user.id } },
    select: { revokedAt: true },
  });
  const state = evaluate(invitation, user, enrollment, now);
  const { lesson } = invitation;
  return {
    state,
    // Lesson card details only — no materials, links or meeting data.
    lesson: { id: lesson.id, title: lesson.title, scheduledStartAt: lesson.scheduledStartAt, scheduledEndAt: lesson.scheduledEndAt },
  };
}

/**
 * Explicit redemption (POST). Transactional and idempotent per student; the redemption
 * counter is incremented with a conditional UPDATE so concurrent requests can never exceed
 * the limit. An existing enrolment is never extended or re-activated by a link.
 */
export async function redeemInvitation(token: string, user: AppUser, now = new Date()): Promise<{ lessonId: string; state: "ENROLLED" | "ALREADY_ENROLLED" }> {
  if (user.role !== "student") throw new ApiError("FORBIDDEN", "Vetëm studentët mund të përdorin ftesat.");
  const invitation = await findByToken(token);
  if (!invitation) throw new ApiError("NOT_FOUND", "Kjo ftesë nuk është e vlefshme.");
  const lessonId = invitation.lessonId;

  try {
    return await prisma.$transaction(async (tx) => {
      const enrollment = await tx.lessonEnrollment.findUnique({
        where: { lessonId_userId: { lessonId, userId: user.id } },
        select: { revokedAt: true },
      });
      const state = evaluate(invitation, user, enrollment, now);
      if (state === "ALREADY_ENROLLED") return { lessonId, state };
      if (state !== "VALID") throw new ApiError(state === "ACCESS_REVOKED" ? "FORBIDDEN" : "CONFLICT", MESSAGES[state]);

      // Atomic claim of one redemption slot, re-checking every condition at write time.
      const claimed = await tx.lessonInvitation.updateMany({
        where: {
          id: invitation.id,
          revokedAt: null,
          redeemUntil: { gt: now },
          ...(invitation.maxRedemptions !== null ? { redemptionCount: { lt: invitation.maxRedemptions } } : {}),
        },
        data: { redemptionCount: { increment: 1 } },
      });
      if (claimed.count === 0) throw new ApiError("CONFLICT", MESSAGES.FULL);

      const created = await tx.lessonEnrollment.create({
        data: { lessonId, userId: user.id, source: "INVITATION", accessExpiresAt: invitation.accessExpiresAt },
        select: { id: true },
      });
      await tx.invitationRedemption.create({ data: { invitationId: invitation.id, userId: user.id, enrollmentId: created.id } });
      return { lessonId, state: "ENROLLED" as const };
    });
  } catch (error) {
    // Two simultaneous requests from the same student: the loser hits the unique constraint
    // and its transaction (including the counter increment) is rolled back.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { lessonId, state: "ALREADY_ENROLLED" };
    }
    throw error;
  }
}
