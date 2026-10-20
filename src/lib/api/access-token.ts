import "client-only";
import axios from "axios";

/**
 * In-memory access token for the current tab. Never written to localStorage/sessionStorage,
 * so an XSS payload can't lift a long-lived credential; the long-lived credential is the
 * HttpOnly session cookie, which JavaScript cannot read.
 *
 * Concurrency: all callers share one in-flight request (single-flight). Issuing an access
 * token does not rotate the session cookie, so several tabs refreshing at the same moment
 * can never revoke each other's session.
 */

const EXPIRY_SKEW_MS = 30_000;

let token: string | null = null;
let expiresAtMs = 0;
let inFlight: Promise<string | null> | null = null;

// Separate bare instance: the token endpoint is authenticated by the cookie, not a Bearer header,
// and must never go through the API client's interceptors (that would loop).
const authHttp = axios.create({ baseURL: "/api/auth", withCredentials: true, timeout: 15_000 });

function readExpiry(jwt: string): number {
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/** Fetches a fresh access token from the session cookie. Resolves null when signed out. */
export function refreshAccessToken(): Promise<string | null> {
  inFlight ??= authHttp
    .get<{ token: string }>("/token")
    .then((response) => {
      token = response.data.token;
      expiresAtMs = readExpiry(token);
      return token;
    })
    .catch((error: unknown) => {
      clearAccessToken();
      if (axios.isAxiosError(error) && error.response?.status === 401) return null;
      throw error; // network/server problems are not "signed out"
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Returns a valid token, refreshing only when missing or about to expire. */
export async function getAccessToken(): Promise<string | null> {
  if (token && Date.now() < expiresAtMs - EXPIRY_SKEW_MS) return token;
  return refreshAccessToken();
}

export function clearAccessToken() {
  token = null;
  expiresAtMs = 0;
}

export { authHttp };
