import "server-only";
import type { z } from "zod";
import { env, zoomLive } from "@/server/env";
import { ApiError } from "@/server/http";

/**
 * Minimal Zoom REST client (Server-to-Server OAuth). One place for auth, timeouts and error
 * mapping. Never logs request/response bodies — they can contain passcodes or join URLs.
 */

const OAUTH_URL = "https://zoom.us/oauth/token";
export const ZOOM_API_URL = "https://api.zoom.us/v2";
const TIMEOUT_MS = 15_000;
/** Refresh a little before Zoom's expiry so a request never starts with a dying token. */
const TOKEN_REFRESH_MARGIN_MS = 60_000;

/** Raised for Zoom HTTP errors; `uncertain` = we can't know whether Zoom applied the request. */
export class ZoomRequestError extends Error {
  constructor(
    readonly status: number | null,
    readonly uncertain: boolean,
  ) {
    super(status === null ? "Zoom request failed (network/timeout)" : `Zoom request failed (${status})`);
    this.name = "ZoomRequestError";
  }
}

export type ZoomCredentials = { accountId: string; clientId: string; clientSecret: string; hostUserId: string };

/** Throws a user-safe error unless real Zoom is enabled and fully configured. */
export function requireZoomCredentials(): ZoomCredentials {
  const { ZOOM_S2S_ACCOUNT_ID, ZOOM_S2S_CLIENT_ID, ZOOM_S2S_CLIENT_SECRET, ZOOM_HOST_USER_ID } = env;
  if (!zoomLive || !ZOOM_S2S_ACCOUNT_ID || !ZOOM_S2S_CLIENT_ID || !ZOOM_S2S_CLIENT_SECRET || !ZOOM_HOST_USER_ID) {
    throw new ApiError("INTEGRATION_NOT_CONFIGURED", "Zoom nuk është aktivizuar (ZOOM_MODE=demo ose mungon konfigurimi).");
  }
  return { accountId: ZOOM_S2S_ACCOUNT_ID, clientId: ZOOM_S2S_CLIENT_ID, clientSecret: ZOOM_S2S_CLIENT_SECRET, hostUserId: ZOOM_HOST_USER_ID };
}

let cachedToken: { value: string; expiresAt: number } | null = null;
let inFlightToken: Promise<string> | null = null;

async function fetchToken(credentials: ZoomCredentials): Promise<string> {
  const url = new URL(OAUTH_URL);
  url.searchParams.set("grant_type", "account_credentials");
  url.searchParams.set("account_id", credentials.accountId);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64")}` },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ZoomRequestError(null, false);
  }
  const body = (await response.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null;
  if (!response.ok || typeof body?.access_token !== "string") {
    console.error("[zoom] OAuth token request failed", { status: response.status });
    throw new ZoomRequestError(response.status, false);
  }
  const lifetimeMs = (typeof body.expires_in === "number" ? body.expires_in : 3600) * 1000;
  cachedToken = { value: body.access_token, expiresAt: Date.now() + lifetimeMs - TOKEN_REFRESH_MARGIN_MS };
  return body.access_token;
}

/** Cached for its lifetime; concurrent callers share one token request. */
async function accessToken(credentials: ZoomCredentials): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;
  inFlightToken ??= fetchToken(credentials).finally(() => {
    inFlightToken = null;
  });
  return inFlightToken;
}

type RequestOptions<T> = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string>;
  body?: unknown;
  /** Response schema; omit for endpoints that return no body (204). */
  schema?: z.ZodType<T>;
  /** Status codes treated as success without a body (e.g. 404 on DELETE). */
  acceptStatus?: number[];
};

export async function zoomRequest<T = void>(path: string, options: RequestOptions<T> = {}): Promise<T> {
  const credentials = requireZoomCredentials();
  const method = options.method ?? "GET";
  const url = new URL(`${ZOOM_API_URL}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);

  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await accessToken(credentials);
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(options.body ? { "Content-Type": "application/json" } : {}) },
        body: options.body ? JSON.stringify(options.body) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      // A timed-out write may still have been applied by Zoom.
      throw new ZoomRequestError(null, method !== "GET");
    }

    if (response.status === 401 && attempt === 0) {
      cachedToken = null; // revoked or rotated: fetch a new token once
      continue;
    }
    if (options.acceptStatus?.includes(response.status)) return undefined as T;
    if (!response.ok) {
      console.error("[zoom] request failed", { method, path: path.replace(/\d{6,}/g, "<id>"), status: response.status });
      throw new ZoomRequestError(response.status, response.status >= 500 && method !== "GET");
    }
    if (!options.schema) return undefined as T;
    const parsed = options.schema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      console.error("[zoom] unexpected response shape", { method, status: response.status });
      throw new ZoomRequestError(response.status, false);
    }
    return parsed.data;
  }
  throw new ZoomRequestError(401, false);
}

/** Maps a Zoom failure to a user-safe API error. */
export function toApiError(error: unknown, message: string): never {
  if (error instanceof ApiError) throw error;
  throw new ApiError("INTEGRATION_FAILED", message);
}

/** Test hook: forget the cached OAuth token. */
export function resetZoomTokenCache() {
  cachedToken = null;
  inFlightToken = null;
}
