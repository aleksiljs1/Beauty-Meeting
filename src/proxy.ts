import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { REQUEST_PATH_HEADER } from "@/lib/safe-next";

/**
 * Optimistic redirect only: checks that a session cookie exists, without touching the
 * database. Real authentication and authorization happen in every page and API route
 * (src/server/auth/session.ts) — never rely on this for security.
 */
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname + request.nextUrl.search;
  if (!getSessionCookie(request, { cookiePrefix: "academy" })) {
    const login = new URL("/hyr", request.url);
    login.searchParams.set("next", path);
    return NextResponse.redirect(login);
  }
  // The page asked for, so a page that finds the session gone can send the user back here after
  // login (always overwritten, never taken from the client).
  const headers = new Headers(request.headers);
  headers.set(REQUEST_PATH_HEADER, path);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/portal/:path*", "/admin/:path*", "/klasa/:path*"],
};
