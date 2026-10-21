
import { createHmac } from "node:crypto";

/**
 * Input needed to generate a Zoom Meeting SDK participant signature.
 *
 * Credentials must come from server-side environment variables.
 * Never call this function from browser code.
 */
export type MeetingSdkSignatureInput = {
  clientId: string;
  clientSecret: string;
  meetingNumber: string;
  /**
   * Optional clock override for deterministic unit tests.
   * Production callers should omit this value.
   */
  nowSeconds?: number;
};

const CLOCK_SKEW_SECONDS = 30;
const TOKEN_LIFETIME_SECONDS = 30 * 60;

/**
 * Generates a Meeting SDK JWT for a participant.
 *
 * The role is deliberately fixed to 0. Host signatures require a separate,
 * explicitly authorized flow and a Zoom user's ZAK token.
 *
 * Credentials must never be returned to the browser.
 */
export function createMeetingSdkParticipantSignature(
  input: MeetingSdkSignatureInput,
): string {
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret;
  const meetingNumber = input.meetingNumber.trim().replace(/\s/g, "");

  if (!clientId) {
    throw new Error("Zoom Meeting SDK Client ID is required.");
  }

  if (!clientSecret) {
    throw new Error("Zoom Meeting SDK Client Secret is required.");
  }

  if (!/^\d{9,12}$/.test(meetingNumber)) {
    throw new Error("A valid Zoom meeting number is required.");
  }

  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);

  if (!Number.isSafeInteger(nowSeconds) || nowSeconds <= 0) {
    throw new Error("A valid issue timestamp is required.");
  }

  // Allow a small clock difference between our server and Zoom's systems.
  const iat = nowSeconds - CLOCK_SKEW_SECONDS;
  const exp = iat + TOKEN_LIFETIME_SECONDS;

  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  const payload = {
    appKey: clientId,
    mn: meetingNumber,
    role: 0,
    iat,
    exp,
    tokenExp: exp,
  };

  // JWT segments use Base64URL encoding, without padding.
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");

  const signingInput = `${encodedHeader}.${encodedPayload}`;

  // HMAC-SHA256 produces the third, cryptographically signed JWT segment.
  const signature = createHmac("sha256", clientSecret)
    .update(signingInput)
    .digest("base64url");

  return `${signingInput}.${signature}`;
}
