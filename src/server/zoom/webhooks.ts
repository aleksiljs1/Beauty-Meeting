import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { env, zoomLive } from "@/server/env";
import { ApiError } from "@/server/http";
import { audit } from "@/server/services/audit";
import { applyMeetingEnded, applyMeetingStarted, type EventOutcome } from "@/server/services/live";
import { toApiError } from "./client";
import { fetchZoomMeetingStatus } from "./meetings";
import { urlValidationResponse, verifyZoomSignature } from "./webhook-signature";

/**
 * Zoom event subscription endpoint logic: verify → store durably → apply → acknowledge.
 * Meeting state changes are quick DB updates, so they run inline; anything long (recording
 * import, Phase 3) will be queued for the worker instead.
 */

const HANDLED_EVENTS = ["meeting.started", "meeting.ended"] as const;
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
          start_time: z.string().optional(),
          end_time: z.string().optional(),
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
  const event = await recordEvent(envelope.event, meetingNumber, envelope.event_ts);
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
async function recordEvent(eventType: string, meetingNumber: string | null, eventTs: number) {
  const dedupeKey = `zoom:${eventType}:${meetingNumber ?? "-"}:${eventTs}`;
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
  const outcome: EventOutcome =
    event === "meeting.started"
      ? await applyMeetingStarted(lesson.id, parseTime(object?.start_time, envelope.event_ts))
      : await applyMeetingEnded(lesson.id, parseTime(object?.end_time, envelope.event_ts));
  return outcome === "applied" ? { status: "PROCESSED", note: null } : { status: "IGNORED", note: "stale or duplicate state" };
}

/**
 * Admin "sync" action: asks Zoom for the meeting's current status and applies it, recovering
 * from a missed webhook (e.g. the server was down when the class started).
 */
export async function syncLessonFromZoom(lessonId: string, admin: AppUser) {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { zoomMeetingNumber: true, meetingStatus: true } });
  if (!lesson) throw new ApiError("NOT_FOUND", "Mësimi nuk u gjet.");
  if (!lesson.zoomMeetingNumber) throw new ApiError("INTEGRATION_NOT_CONFIGURED", "Ky mësim nuk ka ende një takim Zoom.");

  let zoomStatus: Awaited<ReturnType<typeof fetchZoomMeetingStatus>>;
  try {
    zoomStatus = await fetchZoomMeetingStatus(lesson.zoomMeetingNumber);
  } catch (error) {
    toApiError(error, "Statusi nuk u lexua dot nga Zoom.");
  }

  const now = new Date();
  if (zoomStatus === "started" && lesson.meetingStatus !== "LIVE") await applyMeetingStarted(lessonId, now);
  if (zoomStatus === "waiting" && lesson.meetingStatus === "LIVE") await applyMeetingEnded(lessonId, now);
  await audit(admin.id, "lesson.zoom_sync", "lesson", lessonId, { zoomStatus });

  const updated = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId }, select: { meetingStatus: true } });
  return { zoomStatus, meetingStatus: updated.meetingStatus };
}
