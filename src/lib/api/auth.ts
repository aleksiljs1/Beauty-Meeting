import "client-only";
import axios from "axios";
import { authHttp, clearAccessToken, refreshAccessToken } from "./access-token";
import { notifySignedOut } from "./auth-events";

/**
 * Calls to Better Auth's endpoints (/api/auth/*). These are cookie-authenticated and
 * protected by Better Auth's Origin checks; the browser sends the Origin header itself.
 */

export type AuthFailure = "INVALID_CREDENTIALS" | "RATE_LIMITED" | "NETWORK" | "UNKNOWN";

function toFailure(error: unknown): AuthFailure {
  if (!axios.isAxiosError(error)) return "UNKNOWN";
  if (!error.response) return "NETWORK";
  if (error.response.status === 429) return "RATE_LIMITED";
  if (error.response.status === 401 || error.response.status === 403) return "INVALID_CREDENTIALS";
  return "UNKNOWN";
}

export async function signIn(email: string, password: string): Promise<{ ok: true } | { ok: false; failure: AuthFailure }> {
  try {
    await authHttp.post("/sign-in/email", { email, password, rememberMe: true });
    await refreshAccessToken();
    return { ok: true };
  } catch (error) {
    return { ok: false, failure: toFailure(error) };
  }
}

export async function signOut(): Promise<void> {
  try {
    await authHttp.post("/sign-out", {});
  } finally {
    clearAccessToken();
    notifySignedOut("logout");
  }
}

/** Always resolves the same way whether or not the email exists (no account enumeration). */
export async function requestPasswordReset(email: string): Promise<{ ok: boolean; failure?: AuthFailure }> {
  try {
    await authHttp.post("/request-password-reset", { email, redirectTo: "/fjalekalimi/i-ri" });
    return { ok: true };
  } catch (error) {
    const failure = toFailure(error);
    return failure === "INVALID_CREDENTIALS" ? { ok: true } : { ok: false, failure };
  }
}

export async function resetPassword(token: string, newPassword: string): Promise<{ ok: boolean; failure?: AuthFailure }> {
  try {
    await authHttp.post("/reset-password", { token, newPassword });
    return { ok: true };
  } catch (error) {
    return { ok: false, failure: toFailure(error) };
  }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean; failure?: AuthFailure }> {
  try {
    await authHttp.post("/change-password", { currentPassword, newPassword, revokeOtherSessions: true });
    await refreshAccessToken();
    return { ok: true };
  } catch (error) {
    return { ok: false, failure: toFailure(error) };
  }
}
