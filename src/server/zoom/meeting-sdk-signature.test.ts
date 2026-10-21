import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createMeetingSdkHostSignature,
  createMeetingSdkParticipantSignature,
} from "./meeting-sdk-signature";

const TEST_CLIENT_ID = "test-client-id";
const TEST_CLIENT_SECRET = "test-client-secret";
const TEST_MEETING_NUMBER = "1234567890";
const TEST_NOW = 1_800_000_000;

function decodeSegment(segment: string): unknown {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

describe("createMeetingSdkParticipantSignature", () => {
  it("creates a valid HS256 JWT for a participant", () => {
    const token = createMeetingSdkParticipantSignature({
      clientId: TEST_CLIENT_ID,
      clientSecret: TEST_CLIENT_SECRET,
      meetingNumber: TEST_MEETING_NUMBER,
      nowSeconds: TEST_NOW,
    });

    const parts = token.split(".");

    expect(parts).toHaveLength(3);

    const [encodedHeader, encodedPayload, actualSignature] = parts;

    expect(decodeSegment(encodedHeader)).toEqual({
      alg: "HS256",
      typ: "JWT",
    });

    expect(decodeSegment(encodedPayload)).toEqual({
      appKey: TEST_CLIENT_ID,
      mn: TEST_MEETING_NUMBER,
      role: 0,
      iat: TEST_NOW - 30,
      exp: TEST_NOW - 30 + 1800,
      tokenExp: TEST_NOW - 30 + 1800,
    });

    const expectedSignature = createHmac("sha256", TEST_CLIENT_SECRET)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest("base64url");

    expect(actualSignature).toBe(expectedSignature);
  });

  it("normalizes whitespace in the meeting number", () => {
    const token = createMeetingSdkParticipantSignature({
      clientId: TEST_CLIENT_ID,
      clientSecret: TEST_CLIENT_SECRET,
      meetingNumber: "123 456 7890",
      nowSeconds: TEST_NOW,
    });

    const payload = decodeSegment(token.split(".")[1]) as {
      mn: string;
    };

    expect(payload.mn).toBe(TEST_MEETING_NUMBER);
  });

  it("rejects missing credentials", () => {
    expect(() =>
      createMeetingSdkParticipantSignature({
        clientId: "",
        clientSecret: TEST_CLIENT_SECRET,
        meetingNumber: TEST_MEETING_NUMBER,
        nowSeconds: TEST_NOW,
      }),
    ).toThrow("Zoom Meeting SDK Client ID is required.");

    expect(() =>
      createMeetingSdkParticipantSignature({
        clientId: TEST_CLIENT_ID,
        clientSecret: "",
        meetingNumber: TEST_MEETING_NUMBER,
        nowSeconds: TEST_NOW,
      }),
    ).toThrow("Zoom Meeting SDK Client Secret is required.");
  });


  it("creates a host signature with role 1", () => {
    const token = createMeetingSdkHostSignature({
      clientId: TEST_CLIENT_ID,
      clientSecret: TEST_CLIENT_SECRET,
      meetingNumber: TEST_MEETING_NUMBER,
      nowSeconds: TEST_NOW,
    });

    const payload = decodeSegment(token.split(".")[1]) as {
      role: number;
      mn: string;
      appKey: string;
    };

    expect(payload.role).toBe(1);
    expect(payload.mn).toBe(TEST_MEETING_NUMBER);
    expect(payload.appKey).toBe(TEST_CLIENT_ID);
  });


  it("rejects invalid meeting numbers", () => {
    expect(() =>
      createMeetingSdkParticipantSignature({
        clientId: TEST_CLIENT_ID,
        clientSecret: TEST_CLIENT_SECRET,
        meetingNumber: "not-a-meeting",
        nowSeconds: TEST_NOW,
      }),
    ).toThrow("A valid Zoom meeting number is required.");
  });
});
