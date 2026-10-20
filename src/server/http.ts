import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { REQUEST_ID_HEADER, type ApiErrorBody, type ApiErrorCode, type ApiSuccessBody } from "@/lib/api/types";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  LESSON_NOT_AVAILABLE: 404,
  LESSON_ACCESS_EXPIRED: 403,
  LESSON_JOIN_NOT_OPEN: 403,
  INTEGRATION_NOT_CONFIGURED: 503,
  INTEGRATION_FAILED: 502,
  INTERNAL: 500,
};

/** Expected, user-safe failure. The message is shown to the user, so keep it free of internals. */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Authorization responses must never be cached by browsers, proxies or CDNs.
const NO_STORE = { "Cache-Control": "private, no-store" };

export function ok<T>(data: T, init?: { status?: number }): NextResponse<ApiSuccessBody<T>> {
  return NextResponse.json({ data }, { status: init?.status ?? 200, headers: NO_STORE });
}

function errorResponse(code: ApiErrorCode, message: string, requestId: string, issues?: ApiErrorBody["error"]["issues"]) {
  return NextResponse.json<ApiErrorBody>(
    { error: { code, message, issues, requestId } },
    { status: STATUS_BY_CODE[code], headers: { ...NO_STORE, [REQUEST_ID_HEADER]: requestId } },
  );
}

type Handler<Ctx> = (request: Request, context: Ctx) => Promise<Response>;

/**
 * Wraps a route handler with consistent error handling. Unexpected errors are logged with a
 * request id (no request bodies or headers, which may hold credentials) and returned as a
 * generic 500 so provider/database details never reach the client.
 */
export function route<Ctx = unknown>(handler: Handler<Ctx>): Handler<Ctx> {
  return async (request, context) => {
    const requestId = request.headers.get(REQUEST_ID_HEADER)?.slice(0, 64) || crypto.randomUUID();
    try {
      const response = await handler(request, context);
      response.headers.set(REQUEST_ID_HEADER, requestId);
      return response;
    } catch (error) {
      if (error instanceof ApiError) return errorResponse(error.code, error.message, requestId);
      if (error instanceof ZodError) {
        const issues = error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
        return errorResponse("VALIDATION_FAILED", "Disa fusha nuk janë të sakta.", requestId, issues);
      }
      console.error(`[api] ${request.method} ${new URL(request.url).pathname} failed (request ${requestId})`, error);
      return errorResponse("INTERNAL", "Ndodhi një gabim. Provoni përsëri.", requestId);
    }
  };
}

/** Parses a JSON body; malformed JSON becomes a validation error rather than a 500. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError("VALIDATION_FAILED", "Kërkesa nuk është e vlefshme.");
  }
}
