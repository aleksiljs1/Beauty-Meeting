import "server-only";
import { grantLifetimeSeconds } from "@/server/access/policy";
import { requireLessonCapability } from "@/server/access/lesson-access";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/http";
import { bytesMatch, checkDeclaredFile, formatLimit, isInlineSafe, sanitizeDisplayName, SNIFF_BYTES } from "@/server/storage/file-types";
import {
  abortMultipart,
  completeMultipart,
  deleteObject,
  headObject,
  MULTIPART_PART_BYTES,
  newObjectKey,
  presignGet,
  presignPart,
  presignPut,
  readObjectHead,
  READ_URL_MAX_TTL_SECONDS,
  startMultipart,
} from "@/server/storage/storage";
import { audit } from "./audit";
import { PLAYBACK_URL_TTL_SECONDS } from "./recordings";

/**
 * Lesson materials. Upload is two-step: the admin gets presigned upload URL(s) for a PENDING
 * record, uploads directly to storage, then finalizes — only then are size and real file type
 * verified and the material becomes READY (visible to students).
 *
 * Documents and images (≤ 50 MB) use one presigned PUT. MP4 videos (≤ 1 GB) use the same
 * multipart flow as recordings: each part is retried on its own, so a dropped connection doesn't
 * restart a large upload, and no single URL has to outlive the whole transfer.
 */

export type StartedMaterialUpload =
  | { materialId: string; method: "single"; uploadUrl: string; headers: Record<string, string> }
  | { materialId: string; method: "multipart"; partSizeBytes: number; partCount: number };

export async function startMaterialUpload(
  admin: AppUser,
  lessonId: string,
  file: { filename: string; mimeType: string; sizeBytes: number },
): Promise<StartedMaterialUpload> {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { id: true } });
  if (!lesson) throw new ApiError("NOT_FOUND", "Mësimi nuk u gjet.");
  const check = checkDeclaredFile("material", file);
  if (!check.ok && check.reason === "type") {
    throw new ApiError("VALIDATION_FAILED", "Ky lloj skedari nuk lejohet. Lejohen PDF, PowerPoint, Word, imazhe dhe video MP4.");
  }
  if (!check.ok) throw new ApiError("VALIDATION_FAILED", `Skedari është shumë i madh (maksimumi ${formatLimit(check.maxBytes)}).`);

  const objectKey = newObjectKey("materials", lessonId);
  const uploadId = check.multipart ? await startMultipart(objectKey, check.mime) : null;
  const last = await prisma.lessonMaterial.aggregate({ where: { lessonId }, _max: { position: true } });
  const material = await prisma.lessonMaterial.create({
    data: {
      lessonId,
      objectKey,
      displayName: sanitizeDisplayName(file.filename),
      mimeType: check.mime,
      sizeBytes: BigInt(file.sizeBytes),
      position: (last._max.position ?? -1) + 1,
      status: "PENDING",
      uploadId,
      uploadedById: admin.id,
    },
    select: { id: true },
  });
  if (uploadId) {
    return { materialId: material.id, method: "multipart", partSizeBytes: MULTIPART_PART_BYTES, partCount: Math.ceil(file.sizeBytes / MULTIPART_PART_BYTES) };
  }
  const uploadUrl = await presignPut({ key: objectKey, contentType: check.mime, contentLength: file.sizeBytes });
  return { materialId: material.id, method: "single", uploadUrl, headers: { "Content-Type": check.mime } };
}

async function pendingMultipart(materialId: string) {
  const material = await prisma.lessonMaterial.findUnique({ where: { id: materialId } });
  if (!material) throw new ApiError("NOT_FOUND", "Materiali nuk u gjet.");
  if (material.status !== "PENDING" || !material.uploadId) throw new ApiError("CONFLICT", "Ky ngarkim nuk është më aktiv.");
  return material as typeof material & { uploadId: string };
}

/** Presigned URLs for a batch of parts of a multipart (video) upload, requested as it progresses. */
export async function presignMaterialParts(materialId: string, partNumbers: number[]) {
  const material = await pendingMultipart(materialId);
  const maxPart = Math.ceil(Number(material.sizeBytes) / MULTIPART_PART_BYTES);
  if (partNumbers.some((n) => !Number.isInteger(n) || n < 1 || n > maxPart)) throw new ApiError("VALIDATION_FAILED", "Pjesë e pavlefshme.");
  return Promise.all(partNumbers.map(async (partNumber) => ({ partNumber, url: await presignPart(material.objectKey, material.uploadId, partNumber) })));
}

/**
 * Step 2. A multipart upload is completed first (`parts`: the ETags the browser collected);
 * then size and real file type are verified for every material.
 */
export async function finishMaterialUpload(admin: AppUser, materialId: string, parts?: { partNumber: number; etag: string }[]) {
  const material = await prisma.lessonMaterial.findUnique({ where: { id: materialId } });
  if (!material) throw new ApiError("NOT_FOUND", "Materiali nuk u gjet.");
  if (material.status === "READY") return { status: "READY" as const };
  if (material.status === "FAILED") throw new ApiError("CONFLICT", "Ky ngarkim nuk është më aktiv.");

  if (material.uploadId) {
    if (!parts?.length) throw new ApiError("VALIDATION_FAILED", "Mungojnë pjesët e ngarkimit.");
    try {
      await completeMultipart(material.objectKey, material.uploadId, parts);
    } catch (error) {
      console.error("[materials] multipart completion failed", materialId, error);
      await prisma.lessonMaterial.update({ where: { id: materialId }, data: { status: "FAILED", uploadId: null } });
      await abortMultipart(material.objectKey, material.uploadId).catch(() => undefined);
      throw new ApiError("INTEGRATION_FAILED", "Ngarkimi nuk u përfundua. Provoni përsëri.");
    }
    await prisma.lessonMaterial.update({ where: { id: materialId }, data: { uploadId: null } });
  }

  const head = await headObject(material.objectKey);
  const valid =
    head !== null &&
    BigInt(head.size) === material.sizeBytes &&
    bytesMatch("material", material.mimeType, await readObjectHead(material.objectKey, SNIFF_BYTES));

  if (!valid) {
    await prisma.lessonMaterial.update({ where: { id: materialId }, data: { status: "FAILED" } });
    if (head) await deleteObject(material.objectKey);
    throw new ApiError("VALIDATION_FAILED", "Skedari nuk përputhet me llojin e deklaruar ose ngarkimi nuk përfundoi.");
  }
  await prisma.lessonMaterial.update({ where: { id: materialId }, data: { status: "READY" } });
  await audit(admin.id, "material.upload", "lesson", material.lessonId, { materialId });
  return { status: "READY" as const };
}

/** Also cancels an unfinished upload: an open multipart upload is aborted so its parts are freed. */
export async function deleteMaterial(admin: AppUser, materialId: string) {
  const material = await prisma.lessonMaterial.findUnique({ where: { id: materialId }, select: { objectKey: true, lessonId: true, uploadId: true } });
  if (!material) throw new ApiError("NOT_FOUND", "Materiali nuk u gjet.");
  if (material.uploadId) await abortMultipart(material.objectKey, material.uploadId).catch(() => undefined);
  await prisma.lessonMaterial.delete({ where: { id: materialId } });
  await deleteObject(material.objectKey).catch((error) => console.error("[storage] orphan material object", material.objectKey, error));
  await audit(admin.id, "material.delete", "lesson", material.lessonId, { materialId });
}

/** Students (and admins): READY materials of a lesson they can currently access. */
export async function listMaterials(user: AppUser, lessonId: string) {
  await requireLessonCapability(user, lessonId, "VIEW_CONTENT");
  const rows = await prisma.lessonMaterial.findMany({
    where: { lessonId, ...(user.role === "admin" ? {} : { status: "READY" }) },
    orderBy: { position: "asc" },
    select: { id: true, displayName: true, mimeType: true, sizeBytes: true, status: true, createdAt: true },
  });
  return rows.map((m) => ({ ...m, sizeBytes: Number(m.sizeBytes), viewable: isInlineSafe("material", m.mimeType) }));
}

const isVideo = (mime: string) => mime.startsWith("video/");

/**
 * Short-lived URL, re-checked against the access policy on every request. Watching a video
 * gets the recordings' playback lifetime (the player keeps issuing Range requests and renews
 * the grant before it expires); everything else, downloads included, gets at most 60 s.
 */
export async function grantMaterialAccess(user: AppUser, lessonId: string, materialId: string, mode: "view" | "download", now = new Date()) {
  const { access } = await requireLessonCapability(user, lessonId, "VIEW_CONTENT", now);
  const material = await prisma.lessonMaterial.findFirst({ where: { id: materialId, lessonId, status: "READY" } });
  if (!material) throw new ApiError("NOT_FOUND", "Materiali nuk u gjet.");

  const inline = mode === "view" && isInlineSafe("material", material.mimeType);
  const ttl = inline && isVideo(material.mimeType) ? PLAYBACK_URL_TTL_SECONDS : READ_URL_MAX_TTL_SECONDS;
  const expiresIn = Math.min(grantLifetimeSeconds(access, ttl, now), ttl);
  const url = await presignGet({
    key: material.objectKey,
    expiresIn,
    maxTtlSeconds: ttl,
    contentType: material.mimeType,
    filename: material.displayName,
    disposition: inline ? "inline" : "attachment",
  });
  return { url, expiresInSeconds: expiresIn };
}
