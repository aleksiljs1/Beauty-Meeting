import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/http";
import { readBearerToken, verifyAccessToken } from "./access-token";
import { auth } from "./auth";
import type { Role } from "./roles";

/**
 * Data Access Layer for identity. Every protected page and API route goes through one of
 * these functions; the proxy's cookie check is only an optimistic redirect.
 */

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

const userSelect = { id: true, name: true, email: true, role: true, banned: true } as const;

function toAppUser(user: { id: string; name: string; email: string; role: string; banned: boolean | null }): AppUser | null {
  if (user.banned) return null; // deactivated accounts are treated as signed out
  if (user.role !== "admin" && user.role !== "student") return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

// ---------------------------------------------------------------------------
// Server Components / layouts — cookie session, memoized per request.
// ---------------------------------------------------------------------------

export const getPageUser = cache(async (): Promise<AppUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return toAppUser({ ...session.user, role: session.user.role ?? "", banned: session.user.banned ?? false });
});

/** For protected pages: redirects to login when signed out, and away when the role is wrong. */
export async function requirePageUser(role?: Role): Promise<AppUser> {
  const user = await getPageUser();
  if (!user) redirect("/hyr");
  if (role && user.role !== role) redirect(user.role === "admin" ? "/admin" : "/portal");
  return user;
}

// ---------------------------------------------------------------------------
// API route handlers — Bearer access token only (no cookie auth → no CSRF surface).
// ---------------------------------------------------------------------------

export async function requireApiUser(request: Request, role?: Role): Promise<AppUser> {
  const token = readBearerToken(request);
  const claims = token ? await verifyAccessToken(token) : null;
  if (!claims) throw new ApiError("UNAUTHENTICATED", "Ju lutem identifikohuni.");

  // Re-read the user so deactivation and role changes apply immediately, not after token expiry.
  const row = await prisma.user.findUnique({ where: { id: claims.userId }, select: userSelect });
  const user = row ? toAppUser(row) : null;
  if (!user) throw new ApiError("UNAUTHENTICATED", "Ju lutem identifikohuni.");
  if (role && user.role !== role) throw new ApiError("FORBIDDEN", "Nuk keni leje për këtë veprim.");
  return user;
}
