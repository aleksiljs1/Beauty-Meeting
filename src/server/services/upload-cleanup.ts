import "server-only";
import { prisma } from "@/server/db";
import { publishLessonChanged } from "@/server/realtime/publish";
import { abortMultipart, deleteObject } from "@/server/storage/storage";
import { audit } from "./audit";

/**
 * Uploads an admin started but never finished (the tab was closed, the connection dropped for
 * good): a material file still PENDING or a manually uploaded recording still IMPORTING. Their
 * multipart parts (or a single PUT that was never finalized) would otherwise stay in storage
 * forever, and the row would show as "uploading" in the admin pages. A day later they are deleted
 * (deleteAbandonedUploads, run hourly by jobs/upload-cleanup.ts).
 *
 * Zoom imports are not touched: they have their own retries and give-up in zoom/recording-import.ts.
 * Failed uploads (FAILED) are kept: their storage is already released and the admin sees the error.
 */

/** Unfinished uploads older than this are deleted. Even an 8 GB video finishes well within a day. */
export const ABANDONED_UPLOAD_TTL_MS = 24 * 60 * 60_000;
const CLEANUP_BATCH = 50;

/**
 * Deletes abandoned uploads, a batch of each kind per run (a backlog continues next run).
 * Returns how many rows were deleted.
 *
 * Order, as in recordings.ts deleteExpiredRecordings: the row goes first (a file left behind is
 * only wasted space, a row without its file is broken). The delete only matches while the upload
 * is still unfinished with the same uploadId, so one that completed at the last moment is never
 * touched; only then is the multipart aborted and any stored object deleted. Storage failures are
 * logged and don't stop the batch.
 */
export async function deleteAbandonedUploads(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - ABANDONED_UPLOAD_TTL_MS);
  return (await deleteAbandonedMaterialFiles(cutoff)) + (await deleteAbandonedRecordings(cutoff));
}

async function deleteAbandonedMaterialFiles(cutoff: Date): Promise<number> {
  const stale = await prisma.materialFile.findMany({
    where: { status: "PENDING", createdAt: { lt: cutoff } },
    select: { id: true, objectKey: true, uploadId: true, lessons: { select: { lessonId: true } } },
    take: CLEANUP_BATCH,
  });
  let deleted = 0;
  const lessonIds = new Set<string>();
  for (const file of stale) {
    // Its links to lessons cascade with it.
    const { count } = await prisma.materialFile.deleteMany({ where: { id: file.id, status: "PENDING", uploadId: file.uploadId } });
    if (!count) continue; // finished or deleted meanwhile
    deleted++;
    await releaseStorage("material", file.objectKey, file.uploadId);
    await audit(null, "material.upload_abandoned", "material", file.id);
    for (const { lessonId } of file.lessons) lessonIds.add(lessonId);
  }
  for (const lessonId of lessonIds) await publishLessonChanged(lessonId); // admins' open lesson pages drop the stuck file
  return deleted;
}

async function deleteAbandonedRecordings(cutoff: Date): Promise<number> {
  const stale = await prisma.recording.findMany({
    where: { source: "UPLOAD", status: "IMPORTING", createdAt: { lt: cutoff } },
    select: { id: true, lessonId: true, objectKey: true, uploadId: true },
    take: CLEANUP_BATCH,
  });
  let deleted = 0;
  const lessonIds = new Set<string>();
  for (const recording of stale) {
    const { count } = await prisma.recording.deleteMany({ where: { id: recording.id, source: "UPLOAD", status: "IMPORTING", uploadId: recording.uploadId } });
    if (!count) continue;
    deleted++;
    if (recording.objectKey) await releaseStorage("recording", recording.objectKey, recording.uploadId);
    await audit(null, "recording.upload_abandoned", "lesson", recording.lessonId, { recordingId: recording.id });
    lessonIds.add(recording.lessonId);
  }
  for (const lessonId of lessonIds) await publishLessonChanged(lessonId);
  return deleted;
}

/** Frees the parts of an open multipart upload and deletes the object (missing is fine for S3 deletes). */
async function releaseStorage(kind: "material" | "recording", objectKey: string, uploadId: string | null) {
  if (uploadId) {
    await abortMultipart(objectKey, uploadId).catch((error) => console.error(`[storage] orphan ${kind} multipart upload`, objectKey, (error as Error).message));
  }
  await deleteObject(objectKey).catch((error) => console.error(`[storage] orphan ${kind} object`, objectKey, (error as Error).message));
}
