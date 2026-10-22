import "server-only";
import { z } from "zod";

/**
 * Server environment, validated once at startup. Import `env` instead of reading
 * `process.env` directly so a missing or malformed variable fails fast with a clear message.
 * Never import this from client code — nothing here is public.
 */

const optionalSecret = z.string().trim().min(1).optional();

/** The Zoom variables that must all be present when ZOOM_MODE=live. */
export const ZOOM_LIVE_VARIABLES = [
  "ZOOM_CLIENT_ID",
  "ZOOM_CLIENT_SECRET",
  "ZOOM_S2S_ACCOUNT_ID",
  "ZOOM_S2S_CLIENT_ID",
  "ZOOM_S2S_CLIENT_SECRET",
  "ZOOM_HOST_USER_ID",
  "ZOOM_WEBHOOK_SECRET_TOKEN",
  "APP_ENCRYPTION_KEY",
] as const;

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    APP_URL: z.url(),

    DATABASE_URL: z.string().min(1),

    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),

    S3_ENDPOINT: z.url().optional(),
    S3_REGION: z.string().default("auto"),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: z.stringbool().default(false),

    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().positive(),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_SECURE: z.stringbool().default(false),
    MAIL_FROM: z.string().min(1),

    // Header carrying the real client IP, set (overwritten) by the reverse proxy, e.g.
    // "cf-connecting-ip" (Cloudflare) or "x-real-ip" (nginx). Required in production.
    TRUSTED_IP_HEADER: z.string().trim().toLowerCase().min(1).optional(),
    // Optional comma-separated proxy IPs/CIDRs when using a multi-hop X-Forwarded-For chain.
    TRUSTED_PROXIES: z
      .string()
      .optional()
      .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined)),

    // Optional in development (defaults to demo). Production must choose explicitly so a
    // misconfigured deployment never silently turns a real paid lesson into a simulation.
    ZOOM_MODE: z.enum(["demo", "live"]).optional(),
    // Meeting SDK app (General app → Embed → Meeting SDK): signs SDK join JWTs.
    ZOOM_CLIENT_ID: optionalSecret,
    ZOOM_CLIENT_SECRET: optionalSecret,
    // Server-to-Server OAuth app (same Zoom account): creates/updates/deletes meetings, issues ZAK.
    ZOOM_S2S_ACCOUNT_ID: optionalSecret,
    ZOOM_S2S_CLIENT_ID: optionalSecret,
    ZOOM_S2S_CLIENT_SECRET: optionalSecret,
    // Zoom user id or email of the licensed host that owns academy meetings.
    ZOOM_HOST_USER_ID: optionalSecret,
    // Event-subscription secret token: verifies webhook signatures.
    ZOOM_WEBHOOK_SECRET_TOKEN: optionalSecret,
    // "cloud" needs a Zoom plan with cloud recording; "none" records nothing automatically.
    ZOOM_AUTO_RECORDING: z.enum(["none", "cloud"]).default("none"),
    // 32 random bytes, base64url — encrypts stored meeting passcodes (AES-256-GCM).
    APP_ENCRYPTION_KEY: z
      .string()
      .trim()
      .refine((v) => Buffer.from(v, "base64url").length === 32, "APP_ENCRYPTION_KEY must be 32 bytes, base64url-encoded")
      .optional(),
  })
  .transform((value, ctx) => {
    // `next build` also runs with NODE_ENV=production; deployment-only settings are checked
    // when the server actually starts, not while compiling.
    const enforceProduction = value.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build";
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });

    if (!value.ZOOM_MODE && enforceProduction) issue("ZOOM_MODE", "ZOOM_MODE must be set explicitly in production");
    if (!value.TRUSTED_IP_HEADER && enforceProduction) {
      issue("TRUSTED_IP_HEADER", "Set the proxy's client-IP header so rate limits can't be bypassed");
    }
    // Live mode never runs half-configured — it would fail in front of a class instead of at startup.
    if (value.ZOOM_MODE === "live") {
      for (const name of ZOOM_LIVE_VARIABLES) if (!value[name]) issue(name, "Required when ZOOM_MODE=live");
    }

    return { ...value, ZOOM_MODE: value.ZOOM_MODE ?? "demo" };
  });

function loadEnv() {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    // Print variable names and problems only — never values.
    const problems = result.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${problems.join("\n")}\nSee .env.example.`);
  }
  return result.data;
}

export const env = loadEnv();
export const isProduction = env.NODE_ENV === "production";
/** True when real Zoom is enabled (and therefore fully configured, see the schema). */
export const zoomLive = env.ZOOM_MODE === "live";
