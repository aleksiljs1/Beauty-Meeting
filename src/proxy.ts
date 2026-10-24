import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic redirect only: checks that a session cookie exists, without touching the
 * database. Real authentication and authorization happen in every page and API route
 * (src/server/auth/session.ts) — never rely on this for security.
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request, { cookiePrefix: "academy" })) {
    const login = new URL("/hyr", request.url);
    login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/portal/:path*", "/admin/:path*", "/klasa/:path*"],
};
