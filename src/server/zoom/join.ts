import "server-only";
import { requireLessonCapability } from "@/server/access/lesson-access";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { env, zoomLive } from "@/server/env";
import { ApiError } from "@/server/http";
import type { ZoomJoinConfig } from "./host";
import { createMeetingSdkParticipantSignature } from "./meeting-sdk-signature";
import { openPasscode } from "./meetings";

export type JoinResult = { mode: "demo" } | ZoomJoinConfig;

/**
 * Join authorization for a lesson, re-checked against the central access policy on every call
 * (enrolment, revocation, deadline, join window, meeting state). Demo lessons get the labelled
 * demo classroom; real lessons get a participant signature + the meeting details the SDK needs.
 */
export async function authorizeLessonJoin(user: AppUser, lessonId: string): Promise<JoinResult> {
  const { lesson } = await requireLessonCapability(user, lessonId, "JOIN_LIVE");
  if (lesson.isDemo) return { mode: "demo" };
  if (!zoomLive) throw new ApiError("INTEGRATION_NOT_CONFIGURED", "Klasa live do të aktivizohet së shpejti.");

  const meeting = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { zoomMeetingNumber: true, zoomPasscodeEncrypted: true },
  });
  if (!meeting?.zoomMeetingNumber) throw new ApiError("INTEGRATION_NOT_CONFIGURED", "Ky mësim nuk ka ende një takim Zoom.");

  return {
    mode: "student",
    lessonId,
    signature: await createMeetingSdkParticipantSignature({
      clientId: env.ZOOM_CLIENT_ID!,
      clientSecret: env.ZOOM_CLIENT_SECRET!,
      meetingNumber: meeting.zoomMeetingNumber,
    }),
    meetingNumber: meeting.zoomMeetingNumber,
    password: openPasscode(meeting.zoomPasscodeEncrypted),
    userName: user.name,
  };
}
