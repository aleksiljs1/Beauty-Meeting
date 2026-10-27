import "server-only";
import { grantLifetimeSeconds } from "@/server/access/policy";
import { requireLessonCapability } from "@/server/access/lesson-access";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/http";
import { publishLessonChanged } from "@/server/realtime/publish";
import { bytesMatch, MAX_UPLOAD_BYTES, ruleForDeclaredFile, sanitizeDisplayName, SNIFF_BYTES } from "@/server/storage/file-types";
import {
  abortMultipart,
  completeMultipart,
  deleteObject,
  headObject,
  MULTIPART_PART_BYTES,
  newObjectKey,
  presignGet,
  presignPart,
  readObjectHead,
  startMultipart,
} from "@/server/storage/storage";
import { audit } from "./audit";
import { notifyRecordingReady } from "./live";

/**
 * Manual recording upload (the fallback before Zoom cloud recording) — multipart, straight
 * from the browser to storage; the app server never handles the video bytes. Imported Zoom
 * recordings (Phase 3) use the same Recording model and the same playback grant.
 */

/**
 * Playback URL lifetime. A video player keeps issuing Range requests while it plays, so the
 * player asks for a fresh grant (re-checked against the policy) when its URL nears expiry or
 * a request fails. Bounded by the student's deadline like every other grant.
 */
export const PLAYBACK_URL_TTL_SECONDS = 5 * 60;

export async function startRecordingUpload(admin: AppUser, lessonId: string, file: { filename: string; mimeType: string; sizeBytes: number }) {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { id: true } });
  if (!lesson) throw new ApiError("NOT_FOUND", "Mësimi nuk u gjet.");
  const rule = ruleForDeclaredFile("recording", file.filename, file.mimeType);
  if (!rule) throw new ApiError("VALIDATION_FAILED", "Lejohen vetëm video MP4.");
  if (file.sizeBytes <= 0 || file.sizeBytes > MAX_UPLOAD_BYTES.recording) {
    throw new ApiError("VALIDATION_FAILED", "Video është shumë e madhe (maksimumi 8 GB).");
  }

  const objectKey = newObjectKey("recordings", lessonId);
  const uploadId = await startMultipart(objectKey, rule.mime);
  const last = await prisma.recording.aggregate({ where: { lessonId }, _max: { part: true } });
  const recording = await prisma.recording.create({
    data: {
      lessonId,
      source: "UPLOAD",
      status: "IMPORTING",
      objectKey,
      uploadId,
      mimeType: rule.mime,
      sizeBytes: BigInt(file.sizeBytes),
      displayName: sanitizeDisplayName(file.filename),
      part: (last._max.part ?? 0) + 1,
    },
    select: { id: true },
  });
  return { recordingId: recording.id, partSizeBytes: MULTIPART_PART_BYTES, partCount: Math.ceil(file.sizeBytes / MULTIPART_PART_BYTES) };
}

async function pendingUpload(recordingId: string) {
  const recording = await prisma.recording.findUnique({ where: { id: recordingId } });
  if (!recording || recording.source !== "UPLOAD") throw new ApiError("NOT_FOUND", "Regjistrimi nuk u gjet.");
  if (!recording.uploadId || !recording.objectKey || recording.status !== "IMPORTING") {
    throw new ApiError("CONFLICT", "Ky ngarkim nuk është më aktiv.");
  }
  return recording as typeof recording & { uploadId: string; objectKey: string };
}

/** Presigned URLs for a batch of parts (requested as the upload progresses). */
export async function presignRecordingParts(recordingId: string, partNumbers: number[]) {
  const recording = await pendingUpload(recordingId);
  const maxPart = Math.ceil(Number(recording.sizeBytes ?? 0) / MULTIPART_PART_BYTES);
  if (partNumbers.some((n) => !Number.isInteger(n) || n < 1 || n > maxPart)) throw new ApiError("VALIDATION_FAILED", "Pjesë e pavlefshme.");
  return Promise.all(partNumbers.map(async (partNumber) => ({ partNumber, url: await presignPart(recording.objectKey, recording.uploadId, partNumber) })));
}

export async function completeRecordingUpload(admin: AppUser, recordingId: string, parts: { partNumber: number; etag: string }[]) {
  const recording = await pendingUpload(recordingId);
  try {
    await completeMultipart(recording.objectKey, recording.uploadId, parts);
  } catch (error) {
    console.error("[recordings] multipart completion failed", recordingId, error);
    await fail(recordingId, "Ngarkimi nuk u përfundua. Provoni përsëri.");
    await abortMultipart(recording.objectKey, recording.uploadId).catch(() => undefined);
    throw new ApiError("INTEGRATION_FAILED", "Ngarkimi nuk u përfundua. Provoni përsëri.");
  }

  // READY only after the stored object exists, has the expected size and is really MP4.
  const head = await headObject(recording.objectKey);
  const valid =
    head !== null &&
    BigInt(head.size) === recording.sizeBytes &&
    bytesMatch("recording", recording.mimeType ?? "", await readObjectHead(recording.objectKey, SNIFF_BYTES));
  if (!valid) {
    await fail(recordingId, "Skedari nuk është video MP4 e vlefshme.");
    if (head) await deleteObject(recording.objectKey);
    throw new ApiError("VALIDATION_FAILED", "Skedari nuk është video MP4 e vlefshme.");
  }

  await prisma.recording.update({ where: { id: recordingId }, data: { status: "READY", uploadId: null, readyAt: new Date(), errorMessage: null } });
  await audit(admin.id, "recording.upload", "lesson", recording.lessonId, { recordingId });
  await notifyRecordingReady(recording.lessonId, recordingId);
  return { status: "READY" as const };
}

export async function abortRecordingUpload(admin: AppUser, recordingId: string) {
  const recording = await pendingUpload(recordingId);
  await abortMultipart(recording.objectKey, recording.uploadId).catch(() => undefined);
  await prisma.recording.delete({ where: { id: recordingId } });
  await audit(admin.id, "recording.upload_abort", "lesson", recording.lessonId, { recordingId });
}

async function fail(recordingId: string, message: string) {
  await prisma.recording.update({ where: { id: recordingId }, data: { status: "FAILED", uploadId: null, errorMessage: message } });
}

export async function deleteRecording(admin: AppUser, recordingId: string) {
  const recording = await prisma.recording.findUnique({ where: { id: recordingId }, select: { objectKey: true, lessonId: true, uploadId: true } });
  if (!recording) throw new ApiError("NOT_FOUND", "Regjistrimi nuk u gjet.");
  if (recording.objectKey && recording.uploadId) await abortMultipart(recording.objectKey, recording.uploadId).catch(() => undefined);
  await prisma.recording.delete({ where: { id: recordingId } });
  if (recording.objectKey) {
    await deleteObject(recording.objectKey).catch((error) => console.error("[storage] orphan recording object", recording.objectKey, error));
  }
  await audit(admin.id, "recording.delete", "lesson", recording.lessonId, { recordingId });
  await publishLessonChanged(recording.lessonId);
}

/** Students see READY recordings only; admins also see processing/failed ones with their state. */
export async function listRecordings(user: AppUser, lessonId: string) {
  await requireLessonCapability(user, lessonId, "VIEW_CONTENT");
  const rows = await prisma.recording.findMany({
    where: { lessonId, ...(user.role === "admin" ? {} : { status: "READY" }) },
    orderBy: { part: "asc" },
    select: { id: true, part: true, status: true, source: true, durationSeconds: true, sizeBytes: true, errorMessage: true, readyAt: true, displayName: true },
  });
  return rows.map((r) => ({
    ...r,
    sizeBytes: r.sizeBytes === null ? null : Number(r.sizeBytes),
    errorMessage: user.role === "admin" ? r.errorMessage : null,
  }));
}

export async function grantRecordingPlayback(user: AppUser, lessonId: string, recordingId: string, now = new Date()) {
  const { access } = await requireLessonCapability(user, lessonId, "VIEW_CONTENT", now);
  const recording = await prisma.recording.findFirst({ where: { id: recordingId, lessonId, status: "READY" } });
  if (!recording?.objectKey) throw new ApiError("NOT_FOUND", "Regjistrimi nuk është i disponueshëm.");
  const expiresIn = grantLifetimeSeconds(access, PLAYBACK_URL_TTL_SECONDS, now);
  const url = await presignGet({
    key: recording.objectKey,
    expiresIn,
    maxTtlSeconds: PLAYBACK_URL_TTL_SECONDS,
    contentType: "video/mp4",
    filename: recording.displayName ?? `regjistrimi-${recording.part}.mp4`,
    disposition: "inline",
  });
  return { url, expiresInSeconds: expiresIn };
}
