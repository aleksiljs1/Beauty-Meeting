import "server-only";
import { createLocalJWKSet, errors, jwtVerify, type JSONWebKeySet, type JWTPayload } from "jose";
import { env } from "@/server/env";
import { auth } from "./auth";

/**
 * Verifies the short-lived access JWT sent by our Axios client as `Authorization: Bearer`.
 *
 * Public signing keys are cached in memory (they are not user-specific), so verification
 * needs no database round-trip. An unknown `kid` (key rotation) triggers one refetch.
 * Authorization decisions still re-read the user from the database — see session.ts.
 */
let keySet: ReturnType<typeof createLocalJWKSet> | null = null;

async function loadKeySet() {
  const jwks = (await auth.api.getJwks()) as JSONWebKeySet;
  keySet = createLocalJWKSet(jwks);
  return keySet;
}

export type AccessTokenClaims = { userId: string; sessionId: string };

// Tokens without a session id (`sid`) are rejected, so every token is tied to a live session.
function toClaims(payload: JWTPayload): AccessTokenClaims | null {
  return typeof payload.sub === "string" && typeof payload.sid === "string" ? { userId: payload.sub, sessionId: payload.sid } : null;
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
  const options = { issuer: env.APP_URL, audience: env.APP_URL };
  try {
    const { payload } = await jwtVerify(token, keySet ?? (await loadKeySet()), options);
    return toClaims(payload);
  } catch (error) {
    if (error instanceof errors.JWKSNoMatchingKey) {
      try {
        const { payload } = await jwtVerify(token, await loadKeySet(), options);
        return toClaims(payload);
      } catch {
        return null;
      }
    }
    // Expired, malformed or forged tokens are all simply "not authenticated".
    return null;
  }
}

export function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 && token.length < 4096 ? token : null;
}
