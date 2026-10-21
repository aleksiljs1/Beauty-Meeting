import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/server/db";

/**
 * Per-account throttle for sign-in and password-reset requests, independent of IP address.
 * The IP-based limits can be weakened by proxies or rotating addresses; this caps guesses
 * against any single account regardless. Stored in the same RateLimit table (key is a hash,
 * so emails aren't stored in plaintext there).
 */
export const EMAIL_THROTTLE = { windowSeconds: 15 * 60, maxAttempts: 10 } as const;

const keyFor = (scope: string, email: string) =>
  `email:${scope}:${createHash("sha256").update(email.trim().toLowerCase()).digest("hex")}`;

/** Records one attempt; returns false when the account has exceeded its budget for the window. */
export async function allowEmailAttempt(scope: "sign-in" | "reset", email: string, now = Date.now()): Promise<boolean> {
  const key = keyFor(scope, email);
  const windowStart = BigInt(now - EMAIL_THROTTLE.windowSeconds * 1000);
  // Atomic: start a new window, or increment within the current one.
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "rateLimit" (id, key, count, "lastRequest")
    VALUES (${key}, ${key}, 1, ${BigInt(now)})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN "rateLimit"."lastRequest" < ${windowStart} THEN 1 ELSE "rateLimit".count + 1 END,
      "lastRequest" = CASE WHEN "rateLimit"."lastRequest" < ${windowStart} THEN ${BigInt(now)} ELSE "rateLimit"."lastRequest" END
    RETURNING count`;
  return (rows[0]?.count ?? 0) <= EMAIL_THROTTLE.maxAttempts;
}
