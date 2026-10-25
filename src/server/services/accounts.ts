import "server-only";
import { randomBytes } from "node:crypto";
import { auth } from "@/server/auth/auth";
import type { Role } from "@/server/auth/roles";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { ApiError } from "@/server/http";
import { sendMail } from "@/server/mail";
import { accountSetupEmail } from "@/server/mail/templates";
import { audit } from "./audit";

export const ACCOUNT_SETUP_VALID_HOURS = 72;

/**
 * Accounts are only ever created here (by an administrator or the bootstrap command).
 * New accounts have no password: the person sets one through a single-use, expiring,
 * hashed link — reusing Better Auth's password-reset token mechanism with a longer expiry.
 */

export async function createAccountSetupLink(userId: string, validHours = ACCOUNT_SETUP_VALID_HOURS): Promise<string> {
  const ctx = await auth.$context;
  const token = randomBytes(32).toString("base64url");
  await ctx.internalAdapter.createVerificationValue({
    identifier: `reset-password:${token}`, // stored hashed (verification.storeIdentifier = "hashed")
    value: userId,
    expiresAt: new Date(Date.now() + validHours * 3_600_000),
  });
  const url = new URL("/fjalekalimi/i-ri", env.APP_URL);
  url.searchParams.set("token", token);
  url.searchParams.set("setup", "1");
  return url.toString();
}

async function academyName() {
  const settings = await prisma.academySettings.findUnique({ where: { id: 1 }, select: { name: true } });
  return settings?.name ?? "Akademia CEM";
}

export async function sendAccountSetupEmail(user: { id: string; email: string; name: string }) {
  const url = await createAccountSetupLink(user.id);
  await sendMail(
    accountSetupEmail({ to: user.email, name: user.name, url, academyName: await academyName(), validHours: ACCOUNT_SETUP_VALID_HOURS }),
  );
  return url;
}

export async function createAccount(input: { name: string; email: string; role: Role }, actorId: string | null) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new ApiError("CONFLICT", "Ekziston tashmë një llogari me këtë email.");

  // Server-side call without request headers: trusted, and role is set by us, never by the client.
  const { user } = await auth.api.createUser({ body: { name: input.name.trim(), email, role: input.role } });
  await audit(actorId, "account.create", "user", user.id, { role: input.role });
  return { id: user.id, name: user.name, email: user.email };
}

// Activation/deactivation lives in services/students.ts (setStudentActive): it must not use
// auth.api.banUser, which requires an admin cookie session our Bearer-only API doesn't have.
