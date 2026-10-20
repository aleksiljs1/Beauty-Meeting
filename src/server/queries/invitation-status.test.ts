import { describe, expect, it } from "vitest";
import { invitationStatus, rosterEntryState } from "./invitation-status";

const now = new Date("2026-11-01T10:00:00Z");
const later = new Date("2026-11-10T10:00:00Z");
const earlier = new Date("2026-10-01T10:00:00Z");

describe("invitationStatus", () => {
  const base = { revokedAt: null, redeemUntil: later, maxRedemptions: null, redemptionCount: 3 };

  it("is active while valid and unlimited", () => {
    expect(invitationStatus(base, now)).toBe("ACTIVE");
  });
  it("revocation wins over everything", () => {
    expect(invitationStatus({ ...base, revokedAt: earlier, redeemUntil: earlier }, now)).toBe("REVOKED");
  });
  it("expires exactly at the redeem deadline", () => {
    expect(invitationStatus({ ...base, redeemUntil: now }, now)).toBe("EXPIRED");
  });
  it("is full when the limit is reached", () => {
    expect(invitationStatus({ ...base, maxRedemptions: 3 }, now)).toBe("FULL");
    expect(invitationStatus({ ...base, maxRedemptions: 4 }, now)).toBe("ACTIVE");
  });
});

describe("rosterEntryState", () => {
  const lesson = { accessExpiresAt: later };

  it("uses the earlier of lesson and own deadline", () => {
    const own = new Date("2026-11-05T10:00:00Z");
    expect(rosterEntryState(lesson, { accessExpiresAt: own, revokedAt: null }, false, now)).toEqual({ status: "ACTIVE", deadline: own });
    const tooLate = new Date("2026-12-05T10:00:00Z");
    expect(rosterEntryState(lesson, { accessExpiresAt: tooLate, revokedAt: null }, false, now).deadline).toEqual(later);
  });
  it("reports revoked, inactive account and expired", () => {
    expect(rosterEntryState(lesson, { accessExpiresAt: null, revokedAt: earlier }, true, now).status).toBe("REVOKED");
    expect(rosterEntryState(lesson, { accessExpiresAt: null, revokedAt: null }, true, now).status).toBe("INACTIVE_ACCOUNT");
    expect(rosterEntryState(lesson, { accessExpiresAt: earlier, revokedAt: null }, false, now).status).toBe("EXPIRED");
  });
});
