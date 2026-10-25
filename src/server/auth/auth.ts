import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin, jwt } from "better-auth/plugins";
import { prisma } from "@/server/db";
import { env, isProduction } from "@/server/env";
import { sendMail } from "@/server/mail";
import { passwordResetEmail } from "@/server/mail/templates";
import { allowEmailAttempt } from "./email-throttle";
import { ac, roles } from "./roles";

/** Lifetime of the in-memory access JWT used by the Axios client. */
export const ACCESS_TOKEN_TTL_SECONDS = 5 * 60;

export const auth = betterAuth({
  appName: "Akademia CEM",
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.APP_URL],
  database: prismaAdapter(prisma, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    // Students are invited by the administrator; there is no public sign-up.
    disableSignUp: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendMail(passwordResetEmail({ to: user.email, name: user.name, url }));
    },
  },

  // The session cookie is the long-lived credential (HttpOnly). It is refreshed
  // at most daily while the user is active and expires after 14 days idle.
  session: {
    expiresIn: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24,
  },

  // Reset/verification tokens are stored hashed, never in plaintext.
  verification: { storeIdentifier: "hashed" },

  // Persistent store so limits hold across restarts and multiple instances.
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 15 * 60, max: 3 },
      "/reset-password": { window: 15 * 60, max: 5 },
      "/change-password": { window: 15 * 60, max: 5 },
      "/token": { window: 60, max: 30 },
    },
  },

  advanced: {
    cookiePrefix: "academy",
    useSecureCookies: isProduction,
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
    // Client IP for rate limiting must come from a header the reverse proxy OVERWRITES —
    // a client-supplied X-Forwarded-For would let anyone rotate IPs and bypass limits.
    ipAddress: {
      ipAddressHeaders: env.TRUSTED_IP_HEADER ? [env.TRUSTED_IP_HEADER] : ["x-forwarded-for"],
      trustedProxies: env.TRUSTED_PROXIES,
    },
  },

  // Account-level throttle on top of the IP limits (see email-throttle.ts).
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const scope = ctx.path === "/sign-in/email" ? "sign-in" : ctx.path === "/request-password-reset" ? "reset" : null;
      const email: unknown = ctx.body?.email;
      if (!scope || typeof email !== "string") return;
      if (!(await allowEmailAttempt(scope, email))) {
        throw new APIError("TOO_MANY_REQUESTS", { message: "Too many attempts for this account. Try again later." });
      }
    }),
  },

  plugins: [
    admin({ ac, roles, defaultRole: "student", adminRoles: ["admin"] }),
    jwt({
      jwt: {
        issuer: env.APP_URL,
        audience: env.APP_URL,
        expirationTime: `${ACCESS_TOKEN_TTL_SECONDS}s`,
        // Role is a hint for the UI; authorization re-reads the user from the DB. `sid` binds the
        // token to its session, so sign-out/password reset invalidate it immediately.
        definePayload: ({ user, session }) => ({ role: user.role, sid: session.id }),
      },
    }),
    nextCookies(), // must stay last
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
