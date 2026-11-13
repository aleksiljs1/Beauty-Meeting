import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";

const { allowEmailAttempt, EMAIL_THROTTLE, isKnownDevice, knownDeviceToken } = await import("./email-throttle");
const { prisma } = await import("@/server/db");

beforeEach(async () => {
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: "email:" } } });
});

const ATTACKER = "203.0.113.7";
const OWNER = "198.51.100.20";

describe("per-account throttle", () => {
  it("caps attempts per email from one IP, case-insensitively", async () => {
    const now = Date.now();
    for (let i = 0; i < EMAIL_THROTTLE.perIp; i++) {
      expect(await allowEmailAttempt("sign-in", i % 2 ? "Ana@Akademia.local" : "ana@akademia.local", ATTACKER, { now })).toBe(true);
    }
    expect(await allowEmailAttempt("sign-in", "ana@akademia.local", ATTACKER, { now })).toBe(false);
    // Other accounts and other scopes are unaffected.
    expect(await allowEmailAttempt("sign-in", "elira@akademia.local", ATTACKER, { now })).toBe(true);
    expect(await allowEmailAttempt("reset", "ana@akademia.local", ATTACKER, { now })).toBe(true);
  });

  it("does not lock the account's owner out when someone else uses up their budget", async () => {
    const now = Date.now();
    for (let i = 0; i <= EMAIL_THROTTLE.perIp; i++) await allowEmailAttempt("sign-in", "mesuesja@akademia.local", ATTACKER, { now });
    expect(await allowEmailAttempt("sign-in", "mesuesja@akademia.local", ATTACKER, { now })).toBe(false);
    expect(await allowEmailAttempt("sign-in", "mesuesja@akademia.local", OWNER, { now })).toBe(true);
  });

  it("still caps guesses spread over many IPs", async () => {
    const now = Date.now();
    for (let i = 0; i < EMAIL_THROTTLE.total; i++) await allowEmailAttempt("sign-in", "spread@akademia.local", `10.0.${Math.floor(i / 5)}.${i % 5}`, { now });
    expect(await allowEmailAttempt("sign-in", "spread@akademia.local", "10.9.9.9", { now })).toBe(false);
  });

  it("lets a browser that signed in before through when the shared budget is used up", async () => {
    const now = Date.now();
    const email = "pronare@akademia.local";
    for (let i = 0; i < EMAIL_THROTTLE.total; i++) await allowEmailAttempt("sign-in", email, `10.1.${Math.floor(i / 5)}.${i % 5}`, { now });
    expect(await allowEmailAttempt("sign-in", email, OWNER, { now })).toBe(false);
    expect(isKnownDevice(email, knownDeviceToken(email.toUpperCase()))).toBe(true);
    expect(isKnownDevice(email, knownDeviceToken("tjeter@akademia.local"))).toBe(false);
    expect(await allowEmailAttempt("sign-in", email, OWNER, { knownDevice: true, now })).toBe(true);
  });

  it("resets after the window and never stores the email or IP in plaintext", async () => {
    const now = Date.now();
    for (let i = 0; i <= EMAIL_THROTTLE.perIp; i++) await allowEmailAttempt("sign-in", "sara@akademia.local", ATTACKER, { now });
    expect(await allowEmailAttempt("sign-in", "sara@akademia.local", ATTACKER, { now })).toBe(false);
    expect(await allowEmailAttempt("sign-in", "sara@akademia.local", ATTACKER, { now: now + EMAIL_THROTTLE.windowSeconds * 1000 + 1 })).toBe(true);

    const keys = await prisma.rateLimit.findMany({ where: { key: { startsWith: "email:" } }, select: { key: true } });
    expect(keys.every((k) => !k.key.includes("akademia") && !k.key.includes("203.0"))).toBe(true);
  });

  it("is safe under concurrent attempts (no lost increments)", async () => {
    const now = Date.now();
    const results = await Promise.all(Array.from({ length: 20 }, () => allowEmailAttempt("sign-in", "race@akademia.local", ATTACKER, { now })));
    expect(results.filter(Boolean)).toHaveLength(EMAIL_THROTTLE.perIp);
  });
});
