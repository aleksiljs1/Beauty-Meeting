/** Shared between server route handlers and the browser API client. */

export const API_ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_FAILED",
  "CONFLICT",
  "RATE_LIMITED",
  "LESSON_NOT_AVAILABLE",
  "LESSON_ACCESS_EXPIRED",
  "LESSON_JOIN_NOT_OPEN",
  "INTEGRATION_NOT_CONFIGURED",
  "INTEGRATION_FAILED",
  "INTERNAL",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export type ApiFieldIssue = { path: string; message: string };

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    issues?: ApiFieldIssue[];
    requestId?: string;
  };
};

export type ApiSuccessBody<T> = { data: T };

export const REQUEST_ID_HEADER = "x-request-id";
