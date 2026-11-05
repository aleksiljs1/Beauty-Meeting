import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { MeetingStatus } from "@/generated/prisma/enums";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { env, zoomLive } from "@/server/env";
import { ApiError } from "@/server/http";
import { audit } from "@/server/services/audit";
import { applyMeetingEnded, applyMeetingStarted, type EventOutcome } from "@/server/services/live";
import { toApiError } from "./client";
import { recordParticipantJoined, recordParticipantLeft } from "@/server/services/attendance";
import { fetchZoomMeetingStatus } from "./meetings";
import type { ZoomRecordingFile } from "./recording-files";
import { queueZoomRecordings } from "./recording-import";
import { urlValidationResponse, verifyZoomSignature } from "./webhook-signature";

/**
 * Zoom event subscription endpoint logic: verify → store durably → apply → acknowledge.
 * Everything here is a quick DB update; a finished cloud recording is only queued — the
 * background job copies the file (recording-import.ts).
 */

const HANDLED_EVENTS = ["meeting.started", "meeting.ended", "recording.completed", "meeting.participant_joined", "meeting.participant_left"] as const;
type HandledEvent = (typeof HANDLED_EVENTS)[number];
/** A RECEIVED row older than this was abandoned mid-processing and may be retried. */
const STUCK_AFTER_MS = 60_000;

const envelopeSchema = z.object({
  event: z.string().min(1),
  event_ts: z.number().int().positive(),
  payload: z
    .object({
      account_id: z.string().optional(),
      plainToken: z.string().optional(),
      object: z
        .object({
          id: z.union([z.string(), z.number()]).transform(String).optional(),
          uuid: z.string().optional(),
          host_id: z.string().optional(),
          start_time: z.string().optional(),
          end_time: z.string().optional(),
          recording_files: z.array(z.record(z.string(), z.unknown())).optional(),
          participant: z
            .object({
              id: z.string().optional(),
              user_id: z.union([z.string(), z.number()]).transform(String).optional(),
              participant_uuid: z.string().optional(),
              user_name: z.string().default(""),
              customer_key: z.string().optional(),
              join_time: z.string().optional(),
              leave_time: z.string().optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .default({}),
});

export type WebhookResponse = { status: number; body: unknown };

const parseTime = (value: string | undefined, fallbackMs: number) => {
  const ms = value ? Date.parse(value) : NaN;
  return new Date(Number.isNaN(ms) ? fallbackMs : ms);
};

export async function handleZoomWebhook(rawBody: string, headers: Headers): Promise<WebhookResponse> {
  const secret = env.ZOOM_WEBHOOK_SECRET_TOKEN;
  if (!zoomLive || !secret) return { status: 404, body: { error: "not_configured" } };

  const authentic = verifyZoomSignature({
    rawBody,
    signature: headers.get("x-zm-signature"),
    timestamp: headers.get("x-zm-request-timestamp"),
    secret,
  });
  if (!authentic) return { status: 401, body: { error: "invalid_signature" } };

  let envelope: z.infer<typeof envelopeSchema>;
  try {
    envelope = envelopeSchema.parse(JSON.parse(rawBody));
  } catch {
    return { status: 400, body: { error: "invalid_payload" } };
  }

  if (envelope.event === "endpoint.url_validation") {
    if (!envelope.payload.plainToken) return { status: 400, body: { error: "missing_token" } };
    return { status: 200, body: urlValidationResponse(envelope.payload.plainToken, secret) };
  }

  // Only our own account's meetings, only the events we act on.
  const fromOtherAccount = envelope.payload.account_id && envelope.payload.account_id !== env.ZOOM_S2S_ACCOUNT_ID;
  if (fromOtherAccount || !HANDLED_EVENTS.includes(envelope.event as HandledEvent)) return { status: 200, body: { ok: true } };

  const meetingNumber = envelope.payload.object?.id ?? null;
  // Several people can join in the same millisecond: their events must not look like duplicates.
  const event = await recordEvent(envelope.event, meetingNumber, envelope.event_ts, participantKey(envelope));
  if (!event) return { status: 200, body: { ok: true, duplicate: true } };

  try {
    const { status, note } = await applyEvent(envelope.event as HandledEvent, meetingNumber, envelope);
    await prisma.webhookEvent.update({ where: { id: event.id }, data: { status, note, processedAt: new Date() } });
    return { status: 200, body: { ok: true } };
  } catch (error) {
    console.error("[zoom-webhook] processing failed", { event: envelope.event, error: (error as Error).message });
    await prisma.webhookEvent.update({ where: { id: event.id }, data: { status: "FAILED", note: "processing error" } });
    // Non-2xx makes Zoom retry; the FAILED row is picked up again on that retry.
    return { status: 500, body: { error: "processing_failed" } };
  }
}

/**
 * Stores the event; returns null for duplicates that were already handled. A FAILED or
 * stuck event with the same key is re-claimed so Zoom's retry can complete it.
 */
async function recordEvent(eventType: string, meetingNumber: string | null, eventTs: number, discriminator: string | null) {
  const dedupeKey = `zoom:${eventType}:${meetingNumber ?? "-"}:${eventTs}${discriminator ? `:${discriminator}` : ""}`.slice(0, 500);
  try {
    return await prisma.webhookEvent.create({
      data: { provider: "zoom", dedupeKey, eventType, meetingNumber, eventTs: BigInt(eventTs) },
      select: { id: true },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    const reclaimed = await prisma.webhookEvent.updateMany({
      where: {
        dedupeKey,
        OR: [{ status: "FAILED" }, { status: "RECEIVED", receivedAt: { lt: new Date(Date.now() - STUCK_AFTER_MS) } }],
      },
      data: { status: "RECEIVED", receivedAt: new Date() },
    });
    return reclaimed.count ? prisma.webhookEvent.findUnique({ where: { dedupeKey }, select: { id: true } }) : null;
  }
}

async function applyEvent(
  event: HandledEvent,
  meetingNumber: string | null,
  envelope: z.infer<typeof envelopeSchema>,
): Promise<{ status: "PROCESSED" | "IGNORED"; note: string | null }> {
  if (!meetingNumber) return { status: "IGNORED", note: "no meeting id" };
  const lesson = await prisma.lesson.findUnique({ where: { zoomMeetingNumber: meetingNumber }, select: { id: true } });
  if (!lesson) return { status: "IGNORED", note: "meeting not linked to a lesson" };

  const object = envelope.payload.object;
  if (event === "recording.completed") {
    const queued = await queueZoomRecordings(lesson.id, object?.uuid ?? null, (object?.recording_files ?? []) as ZoomRecordingFile[]);
    return queued ? { status: "PROCESSED", note: null } : { status: "IGNORED", note: "no new video files" };
  }
  if (event === "meeting.participant_joined" || event === "meeting.participant_left") {
    const participant = object?.participant;
    const key = participantKey(envelope);
    if (!participant || !key) return { status: "IGNORED", note: "no participant" };
    // The teacher's own presence isn't attendance.
    if (object?.host_id && (participant.id === object.host_id || participant.user_id === object.host_id)) return { status: "IGNORED", note: "host" };
    const joined = event === "meeting.participant_joined";
    const at = parseTime(joined ? participant.join_time : participant.leave_time, envelope.event_ts);
    const details = { key, name: participant.user_name || "Pa emër", customerKey: participant.customer_key ?? null, at };
    if (joined) await recordParticipantJoined(lesson.id, details);
    else await recordParticipantLeft(lesson.id, { ...details, joinedAt: participant.join_time ? parseTime(participant.join_time, envelope.event_ts) : null });
    return { status: "PROCESSED", note: null };
  }
  const outcome: EventOutcome =
    event === "meeting.started"
      ? await applyMeetingStarted(lesson.id, parseTime(object?.start_time, envelope.event_ts))
      : await applyMeetingEnded(lesson.id, parseTime(object?.end_time, envelope.event_ts));
  return outcome === "applied" ? { status: "PROCESSED", note: null } : { status: "IGNORED", note: "stale or duplicate state" };
}

/** Zoom's id for the person in a participant event (stable across rejoins in one meeting). */
function participantKey(envelope: z.infer<typeof envelopeSchema>): string | null {
  const participant = envelope.payload.object?.participant;
  if (!participant) return null;
  return participant.participant_uuid || participant.user_id || participant.id || (participant.user_name ? `name:${participant.user_name}` : null);
}

type ZoomMeetingStatus = Awaited<ReturnType<typeof fetchZoomMeetingStatus>>;

/** Applies the status Zoom reported, recovering from a missed webhook (e.g. the server was down). */
async function applyZoomStatus(lessonId: string, zoomStatus: ZoomMeetingStatus, stored: MeetingStatus) {
  const now = new Date();
  if (zoomStatus === "started" && stored !== "LIVE") await applyMeetingStarted(lessonId, now);
  if (zoomStatus === "waiting" && stored === "LIVE") await applyMeetingEnded(lessonId, now);
}

/** Admin "sync" action. */
export async function syncLessonFromZoom(lessonId: string, admin: AppUser) {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { zoomMeetingNumber: true, meetingStatus: true } });
  if (!lesson) throw new ApiError("NOT_FOUND", "Mësimi nuk u gjet.");
  if (!lesson.zoomMeetingNumber) throw new ApiError("INTEGRATION_NOT_CONFIGURED", "Ky mësim nuk ka ende një takim Zoom.");

  let zoomStatus: ZoomMeetingStatus;
  try {
    zoomStatus = await fetchZoomMeetingStatus(lesson.zoomMeetingNumber);
  } catch (error) {
    toApiError(error, "Statusi nuk u lexua dot nga Zoom.");
  }
  await applyZoomStatus(lessonId, zoomStatus, lesson.meetingStatus);
  await audit(admin.id, "lesson.zoom_sync", "lesson", lessonId, { zoomStatus });

  const updated = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId }, select: { meetingStatus: true } });
  return { zoomStatus, meetingStatus: updated.meetingStatus };
}

const START_CHECK_INTERVAL_MS = 20_000;
/** Per server instance; a missed check only means the next one comes a little later. */
const lastStartCheck = new Map<string, number>();

/**
 * A student asks to join before the site knows the class started: check with Zoom, so a lost
 * "meeting.started" event can't keep the whole class on "waiting for the teacher" (the first
 * join marks the lesson live and alerts everyone). Best effort: never blocks the join itself.
 */
export async function catchUpMeetingStart(lessonId: string, meetingNumber: string, stored: MeetingStatus) {
  if (!zoomLive || stored === "LIVE") return;
  // A whole class clicks Join (and retries) at once: ask Zoom at most once per lesson per interval.
  const now = Date.now();
  if (now - (lastStartCheck.get(lessonId) ?? 0) < START_CHECK_INTERVAL_MS) return;
  lastStartCheck.set(lessonId, now);

  try {
    await applyZoomStatus(lessonId, await fetchZoomMeetingStatus(meetingNumber), stored);
  } catch (error) {
    console.warn("[zoom] status check before join failed", lessonId, (error as Error).message);
  }
}

/** For tests: forget recent checks. */
export function resetStartChecks() {
  lastStartCheck.clear();
}
