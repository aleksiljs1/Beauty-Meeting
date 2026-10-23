import "server-only";
import { z } from "zod";
import type { AppUser } from "@/server/auth/session";
import { decryptSecret, encryptSecret } from "@/server/crypto/secret-box";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { ApiError } from "@/server/http";
import { publishLessonChanged } from "@/server/realtime/publish";
import { audit } from "@/server/services/audit";
import { toApiError, requireZoomCredentials, zoomRequest, ZoomRequestError } from "./client";
import { createMeetingBody, lessonMarker, meetingSchedule, type LessonSchedule } from "./meeting-body";
import { isZoomMeetingUrl } from "./zoom-url";

/**
 * Zoom meetings for lessons: create (duplicate-safe), keep in sync with the lesson, delete.
 * One scheduled meeting per lesson. Webhooks match on the meeting number (see webhooks.ts).
 */

/** A provisioning lock older than this is considered abandoned (crashed request). */
const PROVISIONING_LOCK_MS = 2 * 60_000;

const meetingSchema = z.object({
  id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).transform(String),
  password: z.string().nullish(),
  agenda: z.string().nullish(),
  join_url: z.string().nullish(),
});
const meetingListSchema = z.object({
  meetings: z.array(z.object({ id: z.union([z.number(), z.string()]).transform(String), start_time: z.string().optional() })).default([]),
});

// --- passcode at rest ------------------------------------------------------------------

function encryptionKey(): string {
  if (!env.APP_ENCRYPTION_KEY) throw new ApiError("INTEGRATION_NOT_CONFIGURED", "Mungon APP_ENCRYPTION_KEY.");
  return env.APP_ENCRYPTION_KEY;
}
export const sealPasscode = (passcode: string | null | undefined) => (passcode ? encryptSecret(passcode, encryptionKey()) : null);
export const openPasscode = (sealed: string | null) => (sealed ? decryptSecret(sealed, encryptionKey()) : "");
/** Zoom's join_url, sealed the same way; anything that isn't a Zoom https link is dropped. */
export const sealJoinUrl = (joinUrl: string | null | undefined) =>
  joinUrl && isZoomMeetingUrl(joinUrl) ? encryptSecret(joinUrl, encryptionKey()) : null;
export const openJoinUrl = (sealed: string | null) => (sealed ? decryptSecret(sealed, encryptionKey()) : null);

// --- create ------------------------------------------------------------------------------

/** Looks for a meeting already created for this lesson (e.g. by a request that timed out). */
async function findExistingMeeting(hostUserId: string, lesson: LessonSchedule) {
  const { meetings } = await zoomRequest(`/users/${encodeURIComponent(hostUserId)}/meetings`, {
    query: { type: "upcoming", page_size: "300" },
    schema: meetingListSchema,
  });
  const start = lesson.scheduledStartAt.toISOString().slice(0, 16);
  const candidates = meetings.filter((m) => m.start_time?.slice(0, 16) === start);
  for (const candidate of candidates) {
    const detail = await zoomRequest(`/meetings/${candidate.id}`, { schema: meetingSchema });
    if (detail.agenda?.includes(lessonMarker(lesson.id))) return detail;
  }
  return null;
}

export async function createZoomMeetingForLesson(lessonId: string, admin: AppUser) {
  const { hostUserId } = requireZoomCredentials();
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { id: true, title: true, scheduledStartAt: true, scheduledEndAt: true, isDemo: true, publication: true, meetingStatus: true, zoomMeetingNumber: true },
  });
  if (!lesson) throw new ApiError("NOT_FOUND", "Mësimi nuk u gjet.");
  if (lesson.isDemo) throw new ApiError("CONFLICT", "Klasat demo nuk përdorin Zoom.");
  if (lesson.zoomMeetingNumber) throw new ApiError("CONFLICT", "Ky mësim ka tashmë një takim Zoom.");
  if (lesson.publication === "CANCELLED" || lesson.publication === "ARCHIVED") {
    throw new ApiError("CONFLICT", "Riktheni ose publikoni mësimin para krijimit të takimit.");
  }
  if (lesson.meetingStatus === "LIVE" || lesson.meetingStatus === "ENDED") {
    throw new ApiError("CONFLICT", "Nuk mund të krijoni takim për një mësim live ose të përfunduar.");
  }
  if (lesson.scheduledEndAt.getTime() <= Date.now()) throw new ApiError("VALIDATION_FAILED", "Orari i mësimit ka kaluar.");

  // Lock: only one creation per lesson at a time (double clicks, parallel tabs).
  const lockExpired = new Date(Date.now() - PROVISIONING_LOCK_MS);
  const locked = await prisma.lesson.updateMany({
    where: { id: lessonId, zoomMeetingNumber: null, OR: [{ zoomProvisioningStartedAt: null }, { zoomProvisioningStartedAt: { lt: lockExpired } }] },
    data: { zoomProvisioningStartedAt: new Date() },
  });
  if (locked.count === 0) throw new ApiError("CONFLICT", "Krijimi i takimit është tashmë në proces. Rifreskoni faqen pas pak.");

  try {
    // A previous attempt may have created the meeting in Zoom before failing on our side.
    let meeting = await findExistingMeeting(hostUserId, lesson);
    if (!meeting) {
      try {
        meeting = await zoomRequest(`/users/${encodeURIComponent(hostUserId)}/meetings`, {
          method: "POST",
          body: createMeetingBody(lesson, env.ZOOM_AUTO_RECORDING),
          schema: meetingSchema,
        });
      } catch (error) {
        // Timeout / 5xx: Zoom may still have created it — check before reporting failure.
        if (error instanceof ZoomRequestError && error.uncertain) meeting = await findExistingMeeting(hostUserId, lesson);
        if (!meeting) throw error;
      }
    }

    await prisma.lesson.update({
      where: { id: lessonId },
      data: {
        zoomMeetingNumber: meeting.id,
        zoomPasscodeEncrypted: sealPasscode(meeting.password),
        zoomJoinUrlEncrypted: sealJoinUrl(meeting.join_url),
        zoomProvisioningStartedAt: null,
        meetingStatus: "SCHEDULED",
      },
    });
    await audit(admin.id, "lesson.zoom_meeting_create", "lesson", lessonId, { meetingNumber: meeting.id });
    await publishLessonChanged(lessonId);
    return { lessonId, meetingNumber: meeting.id, meetingStatus: "SCHEDULED" as const };
  } catch (error) {
    await prisma.lesson.update({ where: { id: lessonId }, data: { zoomProvisioningStartedAt: null } });
    await audit(admin.id, "zoom.provision_failed", "lesson", lessonId, {
      status: error instanceof ZoomRequestError ? error.status : null,
    });
    toApiError(error, "Zoom nuk arriti të krijojë takimin. Provoni përsëri.");
  }
}

// --- keep in sync with the lesson ------------------------------------------------------

/**
 * Called after a lesson's title/schedule changed. Best effort: a Zoom failure is audited and
 * reported back, but never blocks saving the lesson itself.
 */
export async function syncZoomMeetingSchedule(lesson: LessonSchedule & { zoomMeetingNumber: string | null }, actorId: string) {
  if (!lesson.zoomMeetingNumber) return { synced: true };
  try {
    await zoomRequest(`/meetings/${lesson.zoomMeetingNumber}`, { method: "PATCH", body: meetingSchedule(lesson) });
    return { synced: true };
  } catch (error) {
    await audit(actorId, "zoom.sync_failed", "lesson", lesson.id, { status: error instanceof ZoomRequestError ? error.status : null });
    return { synced: false };
  }
}

/** Deletes the Zoom meeting of a cancelled/deleted lesson. Missing meetings count as deleted. */
export async function deleteZoomMeeting(lessonId: string, meetingNumber: string | null, actorId: string) {
  if (!meetingNumber) return { deleted: true };
  try {
    await zoomRequest(`/meetings/${meetingNumber}`, { method: "DELETE", acceptStatus: [404] });
    await audit(actorId, "lesson.zoom_meeting_delete", "lesson", lessonId, { meetingNumber });
    return { deleted: true };
  } catch (error) {
    await audit(actorId, "zoom.delete_failed", "lesson", lessonId, { status: error instanceof ZoomRequestError ? error.status : null });
    return { deleted: false };
  }
}

/**
 * The meeting's current links from Zoom (`GET /meetings/{id}`). `start_url` embeds a host
 * token: callers hand it to the admin immediately and never store or log it. Links that
 * aren't Zoom https URLs come back as null.
 */
export async function fetchZoomMeetingLinks(meetingNumber: string): Promise<{ joinUrl: string | null; startUrl: string | null }> {
  const meeting = await zoomRequest(`/meetings/${meetingNumber}`, {
    schema: z.object({ join_url: z.string().nullish(), start_url: z.string().nullish() }),
  });
  const safe = (value: string | null | undefined) => (value && isZoomMeetingUrl(value) ? value : null);
  return { joinUrl: safe(meeting.join_url), startUrl: safe(meeting.start_url) };
}

/** Live status straight from Zoom — used by the admin "sync" action when a webhook was missed. */
export async function fetchZoomMeetingStatus(meetingNumber: string): Promise<"started" | "waiting" | "unknown"> {
  const { status } = await zoomRequest(`/meetings/${meetingNumber}`, { schema: z.object({ status: z.string().optional() }) });
  return status === "started" || status === "waiting" ? status : "unknown";
}
