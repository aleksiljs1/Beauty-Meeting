import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MAX_CLOCK_DRIFT_MS, urlValidationResponse, verifyZoomSignature } from "./webhook-signature";

const secret = "webhook-secret-token";
const nowMs = 1_800_000_000_000;
const timestamp = String(nowMs / 1000);
const body = JSON.stringify({ event: "meeting.started", event_ts: nowMs });
const sign = (b: string, ts = timestamp, s = secret) => `v0=${createHmac("sha256", s).update(`v0:${ts}:${b}`).digest("hex")}`;

describe("verifyZoomSignature", () => {
  it("accepts a correctly signed, fresh request", () => {
    expect(verifyZoomSignature({ rawBody: body, signature: sign(body), timestamp, secret, nowMs })).toBe(true);
  });

  it("rejects a tampered body, a wrong secret and missing headers", () => {
    expect(verifyZoomSignature({ rawBody: body + " ", signature: sign(body), timestamp, secret, nowMs })).toBe(false);
    expect(verifyZoomSignature({ rawBody: body, signature: sign(body, timestamp, "other"), timestamp, secret, nowMs })).toBe(false);
    expect(verifyZoomSignature({ rawBody: body, signature: null, timestamp, secret, nowMs })).toBe(false);
    expect(verifyZoomSignature({ rawBody: body, signature: sign(body), timestamp: null, secret, nowMs })).toBe(false);
    expect(verifyZoomSignature({ rawBody: body, signature: "v0=short", timestamp, secret, nowMs })).toBe(false);
  });

  it("rejects replays outside the allowed clock drift", () => {
    const old = String((nowMs - MAX_CLOCK_DRIFT_MS - 1000) / 1000);
    expect(verifyZoomSignature({ rawBody: body, signature: sign(body, old), timestamp: old, secret, nowMs })).toBe(false);
    expect(verifyZoomSignature({ rawBody: body, signature: sign(body, "abc"), timestamp: "abc", secret, nowMs })).toBe(false);
  });
});

describe("urlValidationResponse", () => {
  it("returns the HMAC of the plain token as hex", () => {
    expect(urlValidationResponse("plain123", secret)).toEqual({
      plainToken: "plain123",
      encryptedToken: createHmac("sha256", secret).update("plain123").digest("hex"),
    });
  });
});
