import "server-only";
import { z } from "zod";
import { prisma } from "@/server/db";
import { env, zoomLive } from "@/server/env";
import { audit } from "@/server/services/audit";
import { notifyRecordingReady } from "@/server/services/live";
import { bytesMatch, SNIFF_BYTES } from "@/server/storage/file-types";
import { abortMultipart, completeMultipart, deleteObject, headObject, MULTIPART_PART_BYTES, newObjectKey, readObjectHead, startMultipart, uploadPart } from "@/server/storage/storage";
import { requireZoomCredentials, zoomDownload, zoomRequest } from "./client";
import { pickRecordingFiles, type ZoomRecordingFile } from "./recording-files";

/**
 * Zoom cloud recordings → Regjistrimet. Zoom's "recording.completed" event (or the hourly
 * catch-up below) queues one WAITING Recording per segment; the background job copies each file
 * from Zoom into our storage in parts (the server never holds more than one part in memory),
 * checks it is a real MP4, marks it READY and tells the students. The Zoom file id is unique, so
 * a repeated event never queues a file twice.
 */

const MAX_ATTEMPTS = 3;
const GAVE_UP = "Importi nga Zoom dështoi disa herë. Shkarkojeni nga Zoom dhe ngarkojeni me dorë.";
const RETRY_AFTER_MS = 10 * 60_000;
/** An import still IMPORTING after this was interrupted (e.g. a restart) and is picked up again.
 *  Longer than the longest allowed download (client.ts), so a slow import is never taken twice. */
const STUCK_AFTER_MS = 3 * 60 * 60_000;

/** Queues a meeting's recording files for import. Returns how many new files were queued. */
export async function queueZoomRecordings(lessonId: string, meetingUuid: string | null, files: ZoomRecordingFile[]) {
  const picked = pickRecordingFiles(files);
  if (!picked.length) return 0;
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { title: true } });
  if (!lesson) return 0;
  const existing = await prisma.recording.findMany({ where: { providerFileId: { in: picked.map((f) => f.id) } }, select: { providerFileId: true } });
  const fresh = picked.filter((f) => !existing.some((e) => e.providerFileId === f.id));
  if (!fresh.length) return 0;

  const last = await prisma.recording.aggregate({ where: { lessonId }, _max: { part: true } });
  const first = (last._max.part ?? 0) + 1;
  const [{ count }] = await prisma.$transaction([
    prisma.recording.createMany({
    data: fresh.map((file, i) => ({
      lessonId,
      source: "ZOOM" as const,
      status: "WAITING" as const,
      providerFileId: file.id,
      providerMeetingUuid: meetingUuid,
      providerDownloadUrl: file.downloadUrl,
      layout: file.layout,
      sizeBytes: file.sizeBytes ? BigInt(file.sizeBytes) : null,
      durationSeconds: file.durationSeconds,
      part: first + i,
      displayName: `${lesson.title}${first + i > 1 ? ` (pjesa ${first + i})` : ""}.mp4`.slice(0, 200),
    })),
    skipDuplicates: true,
    }),
    // Marks the lesson as found, so the catch-up never brings back a recording the admin deleted.
    prisma.lesson.update({ where: { id: lessonId }, data: { zoomRecordingsQueuedAt: new Date() } }),
  ]);
  return count;
}

/** Imports the next queued recording, if any. Returns false when there was nothing to do. */
export async function importNextZoomRecording(now = new Date()): Promise<boolean> {
  const candidate = await prisma.recording.findFirst({
    where: {
      source: "ZOOM",
      providerDownloadUrl: { not: null },
      OR: [
        { status: "WAITING" },
        { status: "IMPORTING", updatedAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } },
        { status: "FAILED", importAttempts: { lt: MAX_ATTEMPTS }, updatedAt: { lt: new Date(now.getTime() - RETRY_AFTER_MS) } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, status: true, updatedAt: true, importAttempts: true },
  });
  if (!candidate) return false;
  if (candidate.importAttempts >= MAX_ATTEMPTS) {
    // Interrupted on its last attempt (e.g. it crashed the server each time): stop trying.
    await prisma.recording.updateMany({
      where: { id: candidate.id, status: candidate.status, updatedAt: candidate.updatedAt },
      data: { status: "FAILED", errorMessage: GAVE_UP },
    });
    return true;
  }
  // Claim it (counting the attempt now, so an import that crashes the server can't loop forever).
  // If another server instance got there first, this changes nothing.
  const claimed = await prisma.recording.updateMany({
    where: { id: candidate.id, status: candidate.status, updatedAt: candidate.updatedAt },
    data: { status: "IMPORTING", errorMessage: null, importAttempts: { increment: 1 } },
  });
  if (!claimed.count) return true;

  const recording = await prisma.recording.findUnique({ where: { id: candidate.id } });
  if (!recording) return true;
  const objectKey = newObjectKey("recordings", recording.lessonId);
  let uploadId: string | null = null;
  let stored = false;
  try {
    const response = await zoomDownload(await currentDownloadUrl(recording));
    uploadId = await startMultipart(objectKey, "video/mp4");
    const size = await streamIntoStorage(response.body!, objectKey, uploadId);
    uploadId = null;
    stored = true;

    const head = await headObject(objectKey);
    const valid = head !== null && head.size === size && size > 0 && bytesMatch("recording", "video/mp4", await readObjectHead(objectKey, SNIFF_BYTES));
    if (!valid) throw new ImportError("Skedari nga Zoom nuk është video MP4 e vlefshme.");

    // Only while still ours: the recording or its lesson may have been deleted during the copy.
    const ready = await prisma.recording.updateMany({
      where: { id: recording.id, status: "IMPORTING" },
      data: { status: "READY", objectKey, mimeType: "video/mp4", sizeBytes: BigInt(size), providerDownloadUrl: null, readyAt: new Date(), errorMessage: null },
    });
    if (!ready.count) {
      await deleteObject(objectKey).catch(() => undefined);
      return true;
    }
  } catch (error) {
    if (uploadId) await abortMultipart(objectKey, uploadId).catch(() => undefined);
    if (stored) await deleteObject(objectKey).catch(() => undefined);
    const attempts = recording.importAttempts;
    console.error("[recordings] Zoom import failed", recording.id, (error as Error).message);
    await prisma.recording.updateMany({
      where: { id: recording.id, status: "IMPORTING" },
      data: {
        status: "FAILED",
        errorMessage:
          error instanceof ImportError
            ? error.message
            : attempts >= MAX_ATTEMPTS
              ? GAVE_UP
              : "Importi nga Zoom dështoi; do të provohet përsëri pas pak.",
      },
    });
    return true;
  }

  // The video is in Regjistrimet; what follows must never turn it back into a failure.
  try {
    await audit(null, "recording.import", "lesson", recording.lessonId, { recordingId: recording.id });
    await notifyRecordingReady(recording.lessonId, recording.id);
    if (env.ZOOM_RECORDINGS_AFTER_IMPORT === "trash" && recording.providerMeetingUuid && recording.providerFileId) {
      await trashCloudFile(recording.providerMeetingUuid, recording.providerFileId);
    }
  } catch (error) {
    console.error("[recordings] imported, but the follow-up failed", recording.id, (error as Error).message);
  }
  return true;
}

class ImportError extends Error {}

const meetingRecordingsSchema = z.object({
  recording_files: z.array(z.object({ id: z.string().optional(), download_url: z.string().optional() })).default([]),
});

/**
 * The download link to use now. The link in Zoom's event only works with that event's own short-lived
 * token, so the file's current link is asked from Zoom's API (it accepts our server token); the stored
 * link is the fallback for a recording queued without a meeting UUID.
 */
async function currentDownloadUrl(recording: { providerMeetingUuid: string | null; providerFileId: string | null; providerDownloadUrl: string | null }) {
  if (!recording.providerMeetingUuid || !recording.providerFileId) return recording.providerDownloadUrl!;
  const meeting = await zoomRequest(`/meetings/${meetingUuidPath(recording.providerMeetingUuid)}/recordings`, {
    schema: meetingRecordingsSchema,
    acceptStatus: [404],
  });
  const url = meeting?.recording_files.find((file) => file.id === recording.providerFileId)?.download_url;
  if (!url) throw new ImportError("Regjistrimi nuk gjendet më në Zoom (mund të jetë fshirë atje).");
  return url;
}

/** Copies the download into storage in multipart parts; returns the total size. */
async function streamIntoStorage(body: ReadableStream<Uint8Array>, key: string, uploadId: string): Promise<number> {
  const reader = body.getReader();
  const parts: { partNumber: number; etag: string }[] = [];
  let buffer = new Uint8Array(MULTIPART_PART_BYTES);
  let filled = 0;
  let total = 0;
  const flush = async () => {
    if (!filled) return;
    parts.push({ partNumber: parts.length + 1, etag: await uploadPart(key, uploadId, parts.length + 1, buffer.subarray(0, filled)) });
    buffer = new Uint8Array(MULTIPART_PART_BYTES);
    filled = 0;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    let offset = 0;
    while (offset < value.length) {
      const take = Math.min(value.length - offset, MULTIPART_PART_BYTES - filled);
      buffer.set(value.subarray(offset, offset + take), filled);
      filled += take;
      offset += take;
      total += take;
      if (filled === MULTIPART_PART_BYTES) await flush();
    }
  }
  await flush();
  if (!parts.length) throw new ImportError("Zoom ktheu një skedar bosh.");
  await completeMultipart(key, uploadId, parts);
  return total;
}

/** Zoom wants a meeting UUID that starts with "/" or contains "//" encoded twice. */
const meetingUuidPath = (uuid: string) => (uuid.startsWith("/") || uuid.includes("//") ? encodeURIComponent(encodeURIComponent(uuid)) : encodeURIComponent(uuid));

async function trashCloudFile(meetingUuid: string, fileId: string) {
  try {
    await zoomRequest(`/meetings/${meetingUuidPath(meetingUuid)}/recordings/${encodeURIComponent(fileId)}`, {
      method: "DELETE",
      query: { action: "trash" },
      acceptStatus: [404],
    });
  } catch (error) {
    console.warn("[recordings] could not move the Zoom cloud file to the trash", (error as Error).message);
  }
}

const listSchema = z.object({
  meetings: z
    .array(
      z.object({
        id: z.union([z.string(), z.number()]).transform(String),
        uuid: z.string().optional(),
        recording_files: z.array(z.record(z.string(), z.unknown())).optional(),
      }),
    )
    .default([]),
});

const CATCH_UP_DAYS = 7;

/**
 * Safety net for a lost "recording.completed" event (e.g. the site was offline): for classes held
 * in the last week whose recording was never found, ask Zoom for the host's recordings once and
 * queue what matches. Returns how many files were queued.
 */
export async function catchUpMissedRecordings(now = new Date()): Promise<number> {
  if (!zoomLive || env.ZOOM_AUTO_RECORDING !== "cloud") return 0;
  const since = new Date(now.getTime() - CATCH_UP_DAYS * 24 * 60 * 60_000);
  const lessons = await prisma.lesson.findMany({
    where: {
      zoomMeetingNumber: { not: null },
      zoomRecordingsQueuedAt: null,
      liveStartedAt: { gte: since },
      // Over: Zoom said so, or the schedule says so (in case the "ended" event was lost too).
      OR: [{ meetingStatus: "ENDED" }, { scheduledEndAt: { lt: now } }],
    },
    select: { id: true, zoomMeetingNumber: true },
  });
  if (!lessons.length) return 0;

  const { hostUserId } = requireZoomCredentials();
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const { meetings } = await zoomRequest(`/users/${encodeURIComponent(hostUserId)}/recordings`, {
    query: { from: day(since), to: day(now), page_size: "300" },
    schema: listSchema,
  });
  let queued = 0;
  for (const meeting of meetings) {
    const lesson = lessons.find((l) => l.zoomMeetingNumber === meeting.id);
    if (lesson) queued += await queueZoomRecordings(lesson.id, meeting.uuid ?? null, (meeting.recording_files ?? []) as ZoomRecordingFile[]);
  }
  return queued;
}
