import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Zoom webhook verification (pure, unit-tested).
 * Zoom signs `v0:{x-zm-request-timestamp}:{raw body}` with HMAC-SHA256 using the event
 * subscription's secret token and sends `v0=<hex>` in `x-zm-signature`.
 */

/** Requests older/newer than this are rejected (replay protection). */
export const MAX_CLOCK_DRIFT_MS = 5 * 60_000;

const hmacHex = (secret: string, message: string) => createHmac("sha256", secret).update(message).digest("hex");

export function verifyZoomSignature(input: {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  secret: string;
  nowMs?: number;
}): boolean {
  const { rawBody, signature, timestamp, secret } = input;
  if (!signature || !timestamp || !/^\d{1,13}$/.test(timestamp)) return false;
  // Zoom sends seconds; tolerate milliseconds too.
  const timestampMs = timestamp.length > 10 ? Number(timestamp) : Number(timestamp) * 1000;
  if (Math.abs((input.nowMs ?? Date.now()) - timestampMs) > MAX_CLOCK_DRIFT_MS) return false;

  const expected = Buffer.from(`v0=${hmacHex(secret, `v0:${timestamp}:${rawBody}`)}`);
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** Response to Zoom's `endpoint.url_validation` challenge. */
export function urlValidationResponse(plainToken: string, secret: string) {
  return { plainToken, encryptedToken: hmacHex(secret, plainToken) };
}
