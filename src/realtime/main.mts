/**
 * Realtime service entry point.   npm run realtime   (alongside `npm run dev`)
 * Verifies access JWTs against the web app's public JWKS (cached by jose, refetched on key
 * rotation) — it needs no auth secrets of its own.
 */
import "dotenv/config";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { createRealtimeServer, type VerifyToken } from "./server";

const env = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url(),
    DATABASE_URL: z.string().min(1),
    REALTIME_PORT: z.coerce.number().int().positive().default(3100),
  })
  .parse(process.env);

const jwks = createRemoteJWKSet(new URL("/api/auth/jwks", env.APP_URL), { cooldownDuration: 30_000 });

const verifyToken: VerifyToken = async (token) => {
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: env.APP_URL, audience: env.APP_URL });
    return payload.sub && payload.exp ? { userId: payload.sub, exp: payload.exp } : null;
  } catch {
    return null;
  }
};

const origin = new URL(env.APP_URL).origin;
const corsOrigins =
  env.NODE_ENV === "production" ? [origin] : [...new Set([origin, ...[3000, 3001, 3002, 3003].map((p) => `http://localhost:${p}`)])];

const server = createRealtimeServer({ verifyToken, databaseUrl: env.DATABASE_URL, corsOrigins });
await server.start(env.REALTIME_PORT);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await server.stop();
    process.exit(0);
  });
}
