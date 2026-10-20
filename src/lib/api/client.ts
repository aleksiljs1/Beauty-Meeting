import "client-only";
import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { clearAccessToken, getAccessToken, refreshAccessToken } from "./access-token";
import { notifySignedOut } from "./auth-events";
import { API_ERROR_CODES, type ApiErrorBody, type ApiErrorCode, type ApiFieldIssue } from "./types";

/**
 * The one Axios instance for our own API (/api/v1). It is constrained to relative URLs on
 * our origin, so the access token can never be attached to Zoom, presigned storage URLs or
 * any other host. Use plain fetch/axios for those.
 */
export const api = axios.create({
  baseURL: "/api/v1",
  timeout: 20_000,
  withCredentials: false, // auth is the Bearer header, not cookies
  headers: { Accept: "application/json" },
});

/** Normalized error every caller receives. `code` drives UI decisions (e.g. expired access). */
export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly issues: ApiFieldIssue[] = [],
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

type RetriableConfig = InternalAxiosRequestConfig & { _authRetried?: boolean };

const isAbsoluteUrl = (url = "") => /^[a-z][a-z\d+.-]*:|^\/\//i.test(url);

api.interceptors.request.use(async (config) => {
  if (isAbsoluteUrl(config.url) || (config.baseURL && config.baseURL !== "/api/v1")) {
    throw new Error("The API client only calls our own /api/v1 endpoints.");
  }
  const token = await getAccessToken();
  if (token) config.headers.set("Authorization", `Bearer ${token}`);
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const config = error.config as RetriableConfig | undefined;
    const status = error.response?.status;

    // 401 = our access token was rejected. Refresh once (shared across concurrent requests)
    // and retry once. 403s such as LESSON_ACCESS_EXPIRED are NOT auth failures and pass through.
    if (status === 401 && config && !config._authRetried) {
      config._authRetried = true;
      clearAccessToken();
      const token = await refreshAccessToken().catch(() => null);
      if (token) {
        config.headers.set("Authorization", `Bearer ${token}`);
        return api.request(config);
      }
      notifySignedOut("expired");
    }

    throw toApiClientError(error);
  },
);

function toApiClientError(error: AxiosError<ApiErrorBody>): ApiClientError {
  const body = error.response?.data?.error;
  if (error.response && body && (API_ERROR_CODES as readonly string[]).includes(body.code)) {
    return new ApiClientError(error.response.status, body.code, body.message, body.issues, body.requestId);
  }
  if (!error.response) {
    return new ApiClientError(0, "INTERNAL", "Nuk ka lidhje me serverin. Kontrolloni internetin.");
  }
  return new ApiClientError(error.response.status, "INTERNAL", "Ndodhi një gabim. Provoni përsëri.");
}

/** Convenience: unwraps `{ data }` from our success envelope. */
export async function apiGet<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  return (await api.get<{ data: T }>(url, { params })).data.data;
}

export async function apiSend<T>(method: "post" | "put" | "patch" | "delete", url: string, body?: unknown): Promise<T> {
  return (await api.request<{ data: T }>({ method, url, data: body })).data.data;
}
