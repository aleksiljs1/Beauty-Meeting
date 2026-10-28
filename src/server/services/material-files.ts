import "server-only";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/http";
import { publishLessonChanged } from "@/server/realtime/publish";
import { bytesMatch, checkDeclaredFile, formatLimit, sanitizeDisplayName, SNIFF_BYTES } from "@/server/storage/file-types";
import {
  abortMultipart,
  completeMultipart,
  deleteObject,
  headObject,
  MULTIPART_PART_BYTES,
  newObjectKey,
  presignPart,
  presignPut,
  readObjectHead,
  startMultipart,
} from "@/server/storage/storage";
import { audit } from "./audit";

/**
 * The materials library: every stored file is a MaterialFile that lessons link to (see
 * materials.ts). Upload is two-step: the admin gets presigned upload URL(s) for a PENDING file,
 * uploads directly to storage, then finalizes — only then are size and real file type verified
 * and the file becomes READY (and visible in the lessons it's linked to).
 *
 * Documents (≤ 100 MB) and images (≤ 50 MB) use one presigned PUT. MP4 videos (≤ 4 GB) use the same
 * multipart flow as recordings: each part is retried on its own, so a dropped connection doesn't
 * restart a large upload, and no single URL has to outlive the whole transfer.
 */

export type StartedFileUpload = { fileId: string } & (
  | { method: "single"; uploadUrl: string; headers: Record<string, string> }
  | { method: "multipart"; partSizeBytes: number; partCount: number }
);

/** Lessons that show a file: told to refresh whenever the file changes. */
async function lessonsUsing(fileId: string) {
  return (await prisma.lessonMaterial.findMany({ where: { fileId }, select: { lessonId: true } })).map((m) => m.lessonId);
}

async function announce(lessonIds: string[]) {
  for (const lessonId of lessonIds) await publishLessonChanged(lessonId); // open lesson pages update without a reload
}

/** Starts an upload into the library; with `lessonId` the file is also added to that lesson. */
export async function startFileUpload(admin: AppUser, file: { filename: string; mimeType: string; sizeBytes: number }, lessonId?: string): Promise<StartedFileUpload> {
  if (lessonId && !(await prisma.lesson.findUnique({ where: { id: lessonId }, select: { id: true } }))) throw new ApiError("NOT_FOUND", "Mësimi nuk u gjet.");
  const check = checkDeclaredFile("material", file);
  if (!check.ok && check.reason === "type") {
    throw new ApiError("VALIDATION_FAILED", "Ky lloj skedari nuk lejohet. Lejohen PDF, PowerPoint, Word, imazhe dhe video MP4.");
  }
  if (!check.ok) throw new ApiError("VALIDATION_FAILED", `Skedari është shumë i madh (maksimumi ${formatLimit(check.maxBytes)}).`);

  const objectKey = newObjectKey("materials", lessonId ?? "library");
  const uploadId = check.multipart ? await startMultipart(objectKey, check.mime) : null;
  const created = await prisma.materialFile.create({
    data: { objectKey, displayName: sanitizeDisplayName(file.filename), mimeType: check.mime, sizeBytes: BigInt(file.sizeBytes), status: "PENDING", uploadId, uploadedById: admin.id },
    select: { id: true },
  });
  if (lessonId) await linkFiles(lessonId, [created.id]);

  if (uploadId) {
    return { fileId: created.id, method: "multipart", partSizeBytes: MULTIPART_PART_BYTES, partCount: Math.ceil(file.sizeBytes / MULTIPART_PART_BYTES) };
  }
  const uploadUrl = await presignPut({ key: objectKey, contentType: check.mime, contentLength: file.sizeBytes });
  return { fileId: created.id, method: "single", uploadUrl, headers: { "Content-Type": check.mime } };
}

/** Adds files at the end of a lesson's list, skipping ones it already has. */
export async function linkFiles(lessonId: string, fileIds: string[]) {
  const last = await prisma.lessonMaterial.aggregate({ where: { lessonId }, _max: { position: true } });
  const start = (last._max.position ?? -1) + 1;
  await prisma.lessonMaterial.createMany({ data: fileIds.map((fileId, i) => ({ lessonId, fileId, position: start + i })), skipDuplicates: true });
}

async function findFile(fileId: string) {
  const file = await prisma.materialFile.findUnique({ where: { id: fileId } });
  if (!file) throw new ApiError("NOT_FOUND", "Materiali nuk u gjet.");
  return file;
}

/** Presigned URLs for a batch of parts of a multipart (video) upload, requested as it progresses. */
export async function presignFileParts(fileId: string, partNumbers: number[]) {
  const file = await findFile(fileId);
  if (file.status !== "PENDING" || !file.uploadId) throw new ApiError("CONFLICT", "Ky ngarkim nuk është më aktiv.");
  const maxPart = Math.ceil(Number(file.sizeBytes) / MULTIPART_PART_BYTES);
  if (partNumbers.some((n) => !Number.isInteger(n) || n < 1 || n > maxPart)) throw new ApiError("VALIDATION_FAILED", "Pjesë e pavlefshme.");
  const uploadId = file.uploadId;
  return Promise.all(partNumbers.map(async (partNumber) => ({ partNumber, url: await presignPart(file.objectKey, uploadId, partNumber) })));
}

/**
 * Step 2. A multipart upload is completed first (`parts`: the ETags the browser collected);
 * then size and real file type are verified for every file.
 */
export async function finishFileUpload(admin: AppUser, fileId: string, parts?: { partNumber: number; etag: string }[]) {
  const file = await findFile(fileId);
  if (file.status === "READY") return { status: "READY" as const };
  if (file.status === "FAILED") throw new ApiError("CONFLICT", "Ky ngarkim nuk është më aktiv.");

  if (file.uploadId) {
    if (!parts?.length) throw new ApiError("VALIDATION_FAILED", "Mungojnë pjesët e ngarkimit.");
    try {
      await completeMultipart(file.objectKey, file.uploadId, parts);
    } catch (error) {
      console.error("[materials] multipart completion failed", fileId, error);
      await prisma.materialFile.update({ where: { id: fileId }, data: { status: "FAILED", uploadId: null } });
      await abortMultipart(file.objectKey, file.uploadId).catch(() => undefined);
      throw new ApiError("INTEGRATION_FAILED", "Ngarkimi nuk u përfundua. Provoni përsëri.");
    }
    await prisma.materialFile.update({ where: { id: fileId }, data: { uploadId: null } });
  }

  const head = await headObject(file.objectKey);
  const valid = head !== null && BigInt(head.size) === file.sizeBytes && bytesMatch("material", file.mimeType, await readObjectHead(file.objectKey, SNIFF_BYTES));
  if (!valid) {
    await prisma.materialFile.update({ where: { id: fileId }, data: { status: "FAILED" } });
    if (head) await deleteObject(file.objectKey);
    throw new ApiError("VALIDATION_FAILED", "Skedari nuk përputhet me llojin e deklaruar ose ngarkimi nuk përfundoi.");
  }
  await prisma.materialFile.update({ where: { id: fileId }, data: { status: "READY" } });
  await audit(admin.id, "material.upload", "material", fileId);
  await announce(await lessonsUsing(fileId));
  return { status: "READY" as const };
}

/** The name shown everywhere the file is used. */
export async function renameFile(fileId: string, displayName: string, admin: AppUser) {
  await findFile(fileId);
  await prisma.materialFile.update({ where: { id: fileId }, data: { displayName: sanitizeDisplayName(displayName) } });
  await audit(admin.id, "material.rename", "material", fileId);
  await announce(await lessonsUsing(fileId));
}

/**
 * Deletes a file from the library and from every lesson that uses it. Also cancels an
 * unfinished upload: an open multipart upload is aborted so its parts are freed.
 */
export async function deleteFile(admin: AppUser, fileId: string) {
  const file = await findFile(fileId);
  const lessonIds = await lessonsUsing(fileId);
  if (file.uploadId) await abortMultipart(file.objectKey, file.uploadId).catch(() => undefined);
  await prisma.materialFile.delete({ where: { id: fileId } });
  await deleteObject(file.objectKey).catch((error) => console.error("[storage] orphan material object", file.objectKey, error));
  await audit(admin.id, "material.delete", "material", fileId, { lessons: lessonIds.length });
  await announce(lessonIds);
}
