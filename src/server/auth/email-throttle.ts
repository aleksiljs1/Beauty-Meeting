import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/server/db";
import { env } from "@/server/env";

/**
 * Per-account throttle for sign-in and password-reset requests, on top of the per-IP limits.
 *
 * Two budgets per account, both counted on every attempt:
 * - per account AND client IP (tight): caps guessing from one place, without letting a stranger
 *   lock the real user out — her own IP has its own budget;
 * - per account from anywhere (loose): caps guessing spread over many IPs. A browser that has
 *   signed in to the account before (it holds its "known device" cookie) skips this one, so
 *   a stranger using it up can't lock the owner out of her own phone or computer.
 * Keys are hashes, so emails and IPs aren't stored in plaintext in the RateLimit table.
 */
export const EMAIL_THROTTLE = { windowSeconds: 15 * 60, perIp: 10, total: 60 } as const;

/** Set after a successful sign-in; proves this browser signed in to that account before. */
export const KNOWN_DEVICE_COOKIE = "academy.known_device";
export const KNOWN_DEVICE_MAX_AGE = 180 * 24 * 60 * 60;

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const accountKey = (email: string) => hash(email.trim().toLowerCase());

/** The cookie value for `email`: a keyed hash, so it can't be made without the server secret. */
export const knownDeviceToken = (email: string) => createHmac("sha256", env.BETTER_AUTH_SECRET).update(`known-device:${accountKey(email)}`).digest("base64url");

export function isKnownDevice(email: string, token: string | null | undefined): boolean {
  if (!token) return false;
  const [given, expected] = [Buffer.from(token), Buffer.from(knownDeviceToken(email))];
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Counts one attempt for `key`; returns the attempts in the current window, this one included. */
async function count(key: string, now: number): Promise<number> {
  const windowStart = BigInt(now - EMAIL_THROTTLE.windowSeconds * 1000);
  // Atomic: start a new window, or increment within the current one.
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "rateLimit" (id, key, count, "lastRequest")
    VALUES (${key}, ${key}, 1, ${BigInt(now)})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN "rateLimit"."lastRequest" < ${windowStart} THEN 1 ELSE "rateLimit".count + 1 END,
      "lastRequest" = CASE WHEN "rateLimit"."lastRequest" < ${windowStart} THEN ${BigInt(now)} ELSE "rateLimit"."lastRequest" END
    RETURNING count`;
  return rows[0]?.count ?? 0;
}

/**
 * Records one attempt for `email` from `ip` (null when unknown: then all unknown clients share one
 * budget); returns false when a budget for the window is used up. A `knownDevice` only has the
 * per-IP budget (its attempts don't count towards the shared one either).
 */
export async function allowEmailAttempt(scope: "sign-in" | "reset", email: string, ip: string | null, { knownDevice = false, now = Date.now() } = {}): Promise<boolean> {
  const account = accountKey(email);
  const [fromIp, total] = await Promise.all([
    count(`email:${scope}:${account}:${hash(ip ?? "unknown")}`, now),
    knownDevice ? 0 : count(`email:${scope}:${account}`, now),
  ]);
  return fromIp <= EMAIL_THROTTLE.perIp && total <= EMAIL_THROTTLE.total;
}
