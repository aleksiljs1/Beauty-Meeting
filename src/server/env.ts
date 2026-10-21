
import "server-only";
import { z } from "zod";

/**
 * Server environment, validated once at startup. Import `env` instead of reading
 * `process.env` directly so a missing or malformed variable fails fast with a clear message.
 * Never import this from client code — nothing here is public.
 */
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

    // Meeting SDK credentials are server-only. Never expose these through NEXT_PUBLIC_ variables.
    // Required when ZOOM_MODE=live.
    ZOOM_CLIENT_ID: z.string().trim().min(1).optional(),
    ZOOM_CLIENT_SECRET: z.string().min(1).optional(),
  })
  .transform((value, ctx) => {
    let invalid = false;

    if (!value.ZOOM_MODE && value.NODE_ENV === "production") {
      ctx.addIssue({
        code: "custom",
        path: ["ZOOM_MODE"],
        message: "ZOOM_MODE must be set explicitly in production",
      });
      invalid = true;
    }

    if (!value.TRUSTED_IP_HEADER && value.NODE_ENV === "production") {
      ctx.addIssue({
        code: "custom",
        path: ["TRUSTED_IP_HEADER"],
        message: "Set the proxy's client-IP header so rate limits can't be bypassed",
      });
      invalid = true;
    }

    // Live Zoom lessons require both Meeting SDK credentials.
    // Keep demo mode available for local development and existing demo lessons.
    if (value.ZOOM_MODE === "live") {
      if (!value.ZOOM_CLIENT_ID) {
        ctx.addIssue({
          code: "custom",
          path: ["ZOOM_CLIENT_ID"],
          message: "Required when ZOOM_MODE=live",
        });
        invalid = true;
      }

      if (!value.ZOOM_CLIENT_SECRET) {
        ctx.addIssue({
          code: "custom",
          path: ["ZOOM_CLIENT_SECRET"],
          message: "Required when ZOOM_MODE=live",
        });
        invalid = true;
      }
    }

    if (invalid) {
      return z.NEVER;
    }

    return {
      ...value,
      ZOOM_MODE: value.ZOOM_MODE ?? "demo",
    };
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
