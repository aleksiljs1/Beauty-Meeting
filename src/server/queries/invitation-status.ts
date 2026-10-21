import { effectiveDeadline, isExpired } from "@/server/access/policy";

/** Pure status helpers for admin lists (unit-tested). Uses the central policy's time rules. */

export type InvitationStatus = "ACTIVE" | "REVOKED" | "EXPIRED" | "FULL";

export function invitationStatus(
  invitation: { revokedAt: Date | null; redeemUntil: Date; maxRedemptions: number | null; redemptionCount: number },
  now: Date,
): InvitationStatus {
  if (invitation.revokedAt) return "REVOKED";
  if (isExpired(invitation.redeemUntil, now)) return "EXPIRED";
  if (invitation.maxRedemptions !== null && invitation.redemptionCount >= invitation.maxRedemptions) return "FULL";
  return "ACTIVE";
}

export type RosterStatus = "ACTIVE" | "REVOKED" | "EXPIRED" | "INACTIVE_ACCOUNT";

export function rosterEntryState(
  lesson: { accessExpiresAt: Date },
  enrollment: { accessExpiresAt: Date | null; revokedAt: Date | null },
  userBanned: boolean,
  now: Date,
): { status: RosterStatus; deadline: Date } {
  const deadline = effectiveDeadline(lesson, enrollment);
  if (enrollment.revokedAt) return { status: "REVOKED", deadline };
  if (userBanned) return { status: "INACTIVE_ACCOUNT", deadline };
  if (isExpired(deadline, now)) return { status: "EXPIRED", deadline };
  return { status: "ACTIVE", deadline };
}
