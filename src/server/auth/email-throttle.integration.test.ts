import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";

const { allowEmailAttempt, EMAIL_THROTTLE } = await import("./email-throttle");
const { prisma } = await import("@/server/db");

beforeEach(async () => {
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: "email:" } } });
});

describe("per-account throttle", () => {
  it("caps attempts per email regardless of IP, case-insensitively", async () => {
    const now = Date.now();
    for (let i = 0; i < EMAIL_THROTTLE.maxAttempts; i++) {
      expect(await allowEmailAttempt("sign-in", i % 2 ? "Ana@Akademia.local" : "ana@akademia.local", now)).toBe(true);
    }
    expect(await allowEmailAttempt("sign-in", "ana@akademia.local", now)).toBe(false);
    // Other accounts and other scopes are unaffected.
    expect(await allowEmailAttempt("sign-in", "elira@akademia.local", now)).toBe(true);
    expect(await allowEmailAttempt("reset", "ana@akademia.local", now)).toBe(true);
  });

  it("resets after the window and never stores the email in plaintext", async () => {
    const now = Date.now();
    for (let i = 0; i <= EMAIL_THROTTLE.maxAttempts; i++) await allowEmailAttempt("sign-in", "sara@akademia.local", now);
    expect(await allowEmailAttempt("sign-in", "sara@akademia.local", now)).toBe(false);
    expect(await allowEmailAttempt("sign-in", "sara@akademia.local", now + EMAIL_THROTTLE.windowSeconds * 1000 + 1)).toBe(true);

    const keys = await prisma.rateLimit.findMany({ where: { key: { startsWith: "email:" } }, select: { key: true } });
    expect(keys.every((k) => !k.key.includes("akademia"))).toBe(true);
  });

  it("is safe under concurrent attempts (no lost increments)", async () => {
    const now = Date.now();
    const results = await Promise.all(Array.from({ length: 20 }, () => allowEmailAttempt("sign-in", "race@akademia.local", now)));
    expect(results.filter(Boolean)).toHaveLength(EMAIL_THROTTLE.maxAttempts);
  });
});
