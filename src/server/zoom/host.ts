import "server-only";
import { z } from "zod";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { ApiError } from "@/server/http";
import { audit } from "@/server/services/audit";
import { requireZoomCredentials, toApiError, zoomRequest } from "./client";
import { createMeetingSdkHostSignature } from "./meeting-sdk-signature";
import { fetchZoomMeetingLinks, openPasscode } from "./meetings";

/** ZAK lifetime requested from Zoom — only needed to start the meeting. */
const ZAK_TTL_SECONDS = 300;

export type ZoomJoinConfig = {
  mode: "host" | "student";
  lessonId: string;
  signature: string;
  meetingNumber: string;
  password: string;
  userName: string;
  zak?: string;
};

/** Admin-only checks shared by both ways of starting a meeting (in the browser / Zoom app). */
async function loadHostableLesson(lessonId: string, admin: AppUser, now: number) {
  if (admin.role !== "admin") throw new ApiError("FORBIDDEN", "Nuk keni leje për të nisur klasën.");
  requireZoomCredentials();

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { id: true, publication: true, meetingStatus: true, isDemo: true, scheduledStartAt: true, scheduledEndAt: true, zoomMeetingNumber: true, zoomPasscodeEncrypted: true },
  });
  if (!lesson) throw new ApiError("NOT_FOUND", "Mësimi nuk u gjet.");
  if (lesson.isDemo) throw new ApiError("CONFLICT", "Kjo klasë është demonstrim dhe nuk përdor Zoom real.");
  if (lesson.publication !== "PUBLISHED") throw new ApiError("CONFLICT", "Publikoni mësimin para se të nisni klasën live.");
  if (!lesson.zoomMeetingNumber) throw new ApiError("INTEGRATION_NOT_CONFIGURED", "Ky mësim nuk ka ende një takim Zoom.");
  // An ENDED meeting may be restarted (e.g. ended by mistake) until the scheduled end below.
  if (lesson.meetingStatus === "ERROR") throw new ApiError("CONFLICT", "Ky takim ka një gabim dhe nuk mund të niset.");
  if (now >= lesson.scheduledEndAt.getTime()) throw new ApiError("CONFLICT", "Orari i këtij mësimi ka përfunduar.");
  return { ...lesson, zoomMeetingNumber: lesson.zoomMeetingNumber }; // keeps the narrowed (non-null) type
}

/**
 * Short-lived authorization for the academy host to start a lesson's meeting in the embedded
 * SDK (role-1 signature + ZAK). Returned only to an authenticated admin; never stored or logged.
 */
export async function createZoomHostAuthorization(lessonId: string, admin: AppUser, now = Date.now()): Promise<ZoomJoinConfig> {
  const lesson = await loadHostableLesson(lessonId, admin, now);
  const { hostUserId } = requireZoomCredentials();

  let zak: string;
  try {
    // Dedicated ZAK endpoint: needs only the narrow `user:read:zak:admin` scope (verified with a real account).
    ({ token: zak } = await zoomRequest(`/users/${encodeURIComponent(hostUserId)}/zak`, {
      query: { ttl: String(ZAK_TTL_SECONDS) },
      schema: z.object({ token: z.string().min(1) }),
    }));
  } catch (error) {
    toApiError(error, "Zoom nuk autorizoi host-in e klasës.");
  }

  const signature = await createMeetingSdkHostSignature({
    clientId: env.ZOOM_CLIENT_ID!,
    clientSecret: env.ZOOM_CLIENT_SECRET!,
    meetingNumber: lesson.zoomMeetingNumber,
  });
  await audit(admin.id, "lesson.zoom_host_authorization", "lesson", lesson.id, { meetingNumber: lesson.zoomMeetingNumber });

  return {
    mode: "host",
    lessonId: lesson.id,
    signature,
    meetingNumber: lesson.zoomMeetingNumber,
    password: openPasscode(lesson.zoomPasscodeEncrypted),
    userName: admin.name,
    zak,
  };
}

/**
 * Starts the meeting in the Zoom desktop app instead (better for sharing a video with sound):
 * a fresh `start_url` straight from Zoom, which embeds a host token. Same checks as the
 * in-browser start; returned only to the admin, never stored or logged.
 */
export async function createZoomHostAppStart(lessonId: string, admin: AppUser, now = Date.now()): Promise<{ startUrl: string }> {
  const lesson = await loadHostableLesson(lessonId, admin, now);

  let startUrl: string | null;
  try {
    ({ startUrl } = await fetchZoomMeetingLinks(lesson.zoomMeetingNumber));
  } catch (error) {
    toApiError(error, "Zoom nuk ktheu lidhjen për nisjen e takimit.");
  }
  if (!startUrl) throw new ApiError("INTEGRATION_FAILED", "Zoom nuk ktheu lidhjen për nisjen e takimit.");

  await audit(admin.id, "lesson.zoom_host_app_start", "lesson", lesson.id, { meetingNumber: lesson.zoomMeetingNumber });
  return { startUrl };
}
