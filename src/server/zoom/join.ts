import "server-only";
import { requireLessonCapability } from "@/server/access/lesson-access";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { env, zoomLive } from "@/server/env";
import { ApiError } from "@/server/http";
import { audit } from "@/server/services/audit";
import { toApiError } from "./client";
import type { ZoomJoinConfig } from "./host";
import { createMeetingSdkParticipantSignature } from "./meeting-sdk-signature";
import { fetchZoomMeetingLinks, openJoinUrl, openPasscode, sealJoinUrl } from "./meetings";
import { catchUpMeetingStart } from "./webhooks";

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
  await catchUpMeetingStart(lessonId, meeting.zoomMeetingNumber, lesson.meetingStatus);

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

/**
 * "Open in the Zoom app" fallback for a device that can't run the embedded meeting: the same
 * policy check as `authorizeLessonJoin`, then Zoom's own join_url (its `pwd` is Zoom's
 * encrypted passcode, not ours). Read from our encrypted copy, or fetched from Zoom once and
 * stored. Note: unlike an SDK signature this link doesn't expire, so every hand-out is audited.
 */
export async function authorizeZoomAppJoin(user: AppUser, lessonId: string): Promise<{ joinUrl: string }> {
  const { lesson } = await requireLessonCapability(user, lessonId, "JOIN_LIVE");
  if (lesson.isDemo) throw new ApiError("CONFLICT", "Klasa demo nuk hapet në aplikacionin Zoom.");
  if (!zoomLive) throw new ApiError("INTEGRATION_NOT_CONFIGURED", "Klasa live do të aktivizohet së shpejti.");

  const meeting = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { zoomMeetingNumber: true, zoomJoinUrlEncrypted: true },
  });
  const meetingNumber = meeting?.zoomMeetingNumber;
  if (!meetingNumber) throw new ApiError("INTEGRATION_NOT_CONFIGURED", "Ky mësim nuk ka ende një takim Zoom.");

  let joinUrl = openJoinUrl(meeting?.zoomJoinUrlEncrypted ?? null);
  if (!joinUrl) {
    try {
      ({ joinUrl } = await fetchZoomMeetingLinks(meetingNumber));
    } catch (error) {
      toApiError(error, "Zoom nuk ktheu lidhjen e takimit. Provoni përsëri.");
    }
    if (!joinUrl) throw new ApiError("INTEGRATION_FAILED", "Zoom nuk ktheu lidhjen e takimit. Provoni përsëri.");
    // Conditional: never attach a link to a meeting that was replaced in the meantime.
    await prisma.lesson.updateMany({ where: { id: lessonId, zoomMeetingNumber: meetingNumber }, data: { zoomJoinUrlEncrypted: sealJoinUrl(joinUrl) } });
  }

  await audit(user.id, "lesson.zoom_app_join", "lesson", lessonId, { meetingNumber });
  return { joinUrl };
}
