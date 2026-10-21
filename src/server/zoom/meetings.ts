import "server-only";
import { z } from "zod";
import { env } from "@/server/env";
import { prisma } from "@/server/db";
import type { AppUser } from "@/server/auth/session";
import { ApiError } from "@/server/http";
import { audit } from "@/server/services/audit";
import { publishLessonChanged } from "@/server/realtime/publish";

const ZOOM_OAUTH_URL = "https://zoom.us/oauth/token";
const ZOOM_API_URL = "https://api.zoom.us/v2";
const REQUEST_TIMEOUT_MS = 15_000;

const createdMeetingSchema = z.object({
  id: z.union([z.string().min(1), z.number().int().positive()]),
  uuid: z.string().min(1),
  password: z.string().nullable().optional(),
});

type ZoomConfig = {
  accountId: string;
  clientId: string;
  clientSecret: string;
  hostUserId: string;
};

function getZoomConfig(): ZoomConfig {
  const { ZOOM_S2S_ACCOUNT_ID, ZOOM_S2S_CLIENT_ID, ZOOM_S2S_CLIENT_SECRET, ZOOM_HOST_USER_ID } = env;

  if (!ZOOM_S2S_ACCOUNT_ID || !ZOOM_S2S_CLIENT_ID || !ZOOM_S2S_CLIENT_SECRET || !ZOOM_HOST_USER_ID) {
    throw new ApiError("INTEGRATION_NOT_CONFIGURED", "Integrimi me Zoom nuk është konfiguruar.");
  }

  return {
    accountId: ZOOM_S2S_ACCOUNT_ID,
    clientId: ZOOM_S2S_CLIENT_ID,
    clientSecret: ZOOM_S2S_CLIENT_SECRET,
    hostUserId: ZOOM_HOST_USER_ID,
  };
}

async function getAccessToken(config: ZoomConfig): Promise<string> {
  const params = new URLSearchParams({
    grant_type: "account_credentials",
    account_id: config.accountId,
  });

  let response: Response;

  try {
    response = await fetch(`${ZOOM_OAUTH_URL}?${params.toString()}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ApiError("INTEGRATION_FAILED", "Nuk mund të lidhemi me Zoom. Provoni përsëri.");
  }

  const payload: unknown = await response.json().catch(() => null);
  const token = z.object({ access_token: z.string().min(1) }).safeParse(payload);

  if (!response.ok || !token.success) {
    console.error("[zoom] OAuth token request failed", { status: response.status });
    throw new ApiError("INTEGRATION_FAILED", "Zoom nuk autorizoi krijimin e takimit.");
  }

  return token.data.access_token;
}

async function deleteRemoteMeeting(accessToken: string, meetingNumber: string) {
  const response = await fetch(
    `${ZOOM_API_URL}/meetings/${encodeURIComponent(meetingNumber)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );

  if (!response.ok && response.status !== 404) {
    throw new Error(`Zoom meeting cleanup failed (${response.status}).`);
  }
}

/**
 * Create one real Zoom meeting for an existing non-demo lesson.
 *
 * The admin API route must authenticate an admin before calling this service.
 * Meeting passcodes and host URLs never leave the server through this result.
 */
export async function createZoomMeetingForLesson(lessonId: string, admin: AppUser) {
  const config = getZoomConfig();

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      title: true,
      scheduledStartAt: true,
      scheduledEndAt: true,
      isDemo: true,
      publication: true,
      meetingStatus: true,
      zoomMeetingNumber: true,
      zoomMeetingUuid: true,
    },
  });

  if (!lesson) throw new ApiError("NOT_FOUND", "Mësimi nuk u gjet.");

  if (lesson.isDemo) {
    throw new ApiError("CONFLICT", "Nuk mund të krijoni takim Zoom për një klasë demo.");
  }

  if (lesson.zoomMeetingNumber || lesson.zoomMeetingUuid) {
    throw new ApiError("CONFLICT", "Ky mësim tashmë është lidhur me një takim Zoom.");
  }

  if (lesson.publication === "CANCELLED" || lesson.publication === "ARCHIVED") {
    throw new ApiError("CONFLICT", "Riktheni ose publikoni mësimin para krijimit të takimit.");
  }

  if (lesson.meetingStatus === "LIVE" || lesson.meetingStatus === "ENDED") {
    throw new ApiError("CONFLICT", "Nuk mund të krijoni takim për një mësim live ose të përfunduar.");
  }

  if (lesson.scheduledStartAt.getTime() <= Date.now()) {
    throw new ApiError("VALIDATION_FAILED", "Orari i mësimit duhet të jetë në të ardhmen.");
  }

  const accessToken = await getAccessToken(config);
  const durationMinutes = Math.ceil(
    (lesson.scheduledEndAt.getTime() - lesson.scheduledStartAt.getTime()) / 60_000,
  );

  let response: Response;

  try {
    response = await fetch(
      `${ZOOM_API_URL}/users/${encodeURIComponent(config.hostUserId)}/meetings`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topic: lesson.title,
          type: 2,
          start_time: lesson.scheduledStartAt.toISOString(),
          duration: durationMinutes,
          timezone: "UTC",
          settings: {
            join_before_host: false,
            waiting_room: true,
            host_video: true,
            participant_video: true,
          },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
  } catch {
    throw new ApiError("INTEGRATION_FAILED", "Nuk mund të lidhemi me Zoom. Provoni përsëri.");
  }

  const payload: unknown = await response.json().catch(() => null);
  const parsed = createdMeetingSchema.safeParse(payload);

  if (!response.ok || !parsed.success) {
    console.error("[zoom] Create meeting request failed", { status: response.status });
    throw new ApiError("INTEGRATION_FAILED", "Zoom nuk arriti të krijojë takimin.");
  }

  const meetingNumber = String(parsed.data.id);
  const meetingUuid = parsed.data.uuid;
  const meetingPassword = parsed.data.password || null;

  // Compare-and-set: prevents two overlapping requests from attaching different
  // meetings to the same lesson. If another request wins, remove this new meeting.
  let saved: { count: number };

  try {
    saved = await prisma.lesson.updateMany({
      where: {
        id: lessonId,
        zoomMeetingNumber: null,
        zoomMeetingUuid: null,
        isDemo: false,
        publication: { notIn: ["CANCELLED", "ARCHIVED"] },
        meetingStatus: { notIn: ["LIVE", "ENDED"] },
      },
      data: {
        zoomMeetingNumber: meetingNumber,
        zoomMeetingUuid: meetingUuid,
        zoomMeetingPassword: meetingPassword,
        meetingStatus: "SCHEDULED",
      },
    });
  } catch {
    try {
      await deleteRemoteMeeting(accessToken, meetingNumber);
    } catch {
      console.error("[zoom] Could not clean up a meeting after a database error", { meetingNumber });
    }

    throw new ApiError(
      "INTEGRATION_FAILED",
      "Takimi u krijua në Zoom, por nuk u ruajt në akademi. Verifikoni Zoom para se të provoni përsëri.",
    );
  }

  if (saved.count !== 1) {
    try {
      await deleteRemoteMeeting(accessToken, meetingNumber);
    } catch {
      console.error("[zoom] Could not clean up a duplicate meeting", { meetingNumber });
    }

    throw new ApiError("CONFLICT", "Mësimi u ndryshua gjatë krijimit. Rifreskoni faqen.");
  }

  await audit(admin.id, "lesson.zoom_meeting_create", "lesson", lessonId, {
    provider: "zoom",
    meetingNumber,
  });
  await publishLessonChanged(lessonId);

  //Do not return meetingPassword, the Zoom host start URL, or OAuth tokens.
  return {
    lessonId,
    meetingNumber,
    meetingUuid,
    meetingStatus: "SCHEDULED" as const,
  };
}
