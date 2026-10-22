import "server-only";
import { SignJWT } from "jose";

/**
 * Meeting SDK join signatures (HS256 JWT signed with the Meeting SDK app's Client Secret),
 * using `jose` rather than hand-rolled JWT code. Server-only: callers pass the secret.
 *
 * Zoom requires `exp` at least 1800 s after `iat` (max 48 h). `iat` is backdated slightly
 * to tolerate clock skew between our server and Zoom.
 */
export type MeetingSdkSignatureInput = {
  clientId: string;
  clientSecret: string;
  meetingNumber: string;
  /** Clock override for deterministic tests. */
  nowSeconds?: number;
};

const CLOCK_SKEW_SECONDS = 30;
const TOKEN_LIFETIME_SECONDS = 30 * 60;

async function createMeetingSdkSignature(input: MeetingSdkSignatureInput, role: 0 | 1): Promise<string> {
  const clientId = input.clientId.trim();
  const meetingNumber = input.meetingNumber.replace(/\s/g, "");
  if (!clientId) throw new Error("Zoom Meeting SDK Client ID is required.");
  if (!input.clientSecret) throw new Error("Zoom Meeting SDK Client Secret is required.");
  if (!/^\d{9,12}$/.test(meetingNumber)) throw new Error("A valid Zoom meeting number is required.");

  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds <= 0) throw new Error("A valid issue timestamp is required.");
  const iat = nowSeconds - CLOCK_SKEW_SECONDS;
  const exp = iat + TOKEN_LIFETIME_SECONDS;

  return new SignJWT({ appKey: clientId, mn: meetingNumber, role, iat, exp, tokenExp: exp })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .sign(new TextEncoder().encode(input.clientSecret));
}

/** Role 0 — an enrolled student joining as participant. */
export const createMeetingSdkParticipantSignature = (input: MeetingSdkSignatureInput) => createMeetingSdkSignature(input, 0);

/** Role 1 — the academy host. Only valid together with the host's ZAK token. */
export const createMeetingSdkHostSignature = (input: MeetingSdkSignatureInput) => createMeetingSdkSignature(input, 1);
