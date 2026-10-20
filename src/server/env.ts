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

    // Optional in development (defaults to demo). Production must choose explicitly so a
    // misconfigured deployment never silently turns a real paid lesson into a simulation.
    ZOOM_MODE: z.enum(["demo", "live"]).optional(),
  })
  .transform((value, ctx) => {
    if (!value.ZOOM_MODE && value.NODE_ENV === "production") {
      ctx.addIssue({ code: "custom", path: ["ZOOM_MODE"], message: "ZOOM_MODE must be set explicitly in production" });
      return z.NEVER;
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
