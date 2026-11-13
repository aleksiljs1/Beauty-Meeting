import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/server/db";

/**
 * Per-account throttle for sign-in and password-reset requests, on top of the per-IP limits.
 *
 * Two budgets per account, both counted on every attempt:
 * - per account AND client IP (tight): caps guessing from one place, without letting a stranger
 *   lock the real user out — her own IP has its own budget;
 * - per account from anywhere (loose): caps guessing spread over many IPs.
 * Keys are hashes, so emails and IPs aren't stored in plaintext in the RateLimit table.
 */
export const EMAIL_THROTTLE = { windowSeconds: 15 * 60, perIp: 10, total: 60 } as const;

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

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
 * budget); returns false when either budget for the window is used up.
 */
export async function allowEmailAttempt(scope: "sign-in" | "reset", email: string, ip: string | null, now = Date.now()): Promise<boolean> {
  const account = hash(email.trim().toLowerCase());
  const [fromIp, total] = await Promise.all([
    count(`email:${scope}:${account}:${hash(ip ?? "unknown")}`, now),
    count(`email:${scope}:${account}`, now),
  ]);
  return fromIp <= EMAIL_THROTTLE.perIp && total <= EMAIL_THROTTLE.total;
}
