import "server-only";
import { grantLifetimeSeconds } from "@/server/access/policy";
import { requireLessonCapability } from "@/server/access/lesson-access";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/http";
import { bytesMatch, isInlineSafe, MAX_UPLOAD_BYTES, ruleForDeclaredFile, sanitizeDisplayName, SNIFF_BYTES } from "@/server/storage/file-types";
import { deleteObject, headObject, newObjectKey, presignGet, presignPut, readObjectHead, READ_URL_MAX_TTL_SECONDS } from "@/server/storage/storage";
import { audit } from "./audit";

/**
 * Lesson materials. Upload is two-step: the admin gets a presigned PUT for a PENDING record,
 * uploads directly to storage, then finalizes — only then are size and real file type
 * verified and the material becomes READY (visible to students).
 */

export async function startMaterialUpload(admin: AppUser, lessonId: string, file: { filename: string; mimeType: string; sizeBytes: number }) {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { id: true } });
  if (!lesson) throw new ApiError("NOT_FOUND", "Mësimi nuk u gjet.");
  const rule = ruleForDeclaredFile("material", file.filename, file.mimeType);
  if (!rule) throw new ApiError("VALIDATION_FAILED", "Ky lloj skedari nuk lejohet. Lejohen PDF, PowerPoint, Word dhe imazhe.");
  if (file.sizeBytes <= 0 || file.sizeBytes > MAX_UPLOAD_BYTES.material) {
    throw new ApiError("VALIDATION_FAILED", "Skedari është shumë i madh (maksimumi 50 MB).");
  }

  const objectKey = newObjectKey("materials", lessonId);
  const last = await prisma.lessonMaterial.aggregate({ where: { lessonId }, _max: { position: true } });
  const material = await prisma.lessonMaterial.create({
    data: {
      lessonId,
      objectKey,
      displayName: sanitizeDisplayName(file.filename),
      mimeType: rule.mime,
      sizeBytes: BigInt(file.sizeBytes),
      position: (last._max.position ?? -1) + 1,
      status: "PENDING",
      uploadedById: admin.id,
    },
    select: { id: true },
  });
  const uploadUrl = await presignPut({ key: objectKey, contentType: rule.mime, contentLength: file.sizeBytes });
  return { materialId: material.id, uploadUrl, headers: { "Content-Type": rule.mime } };
}

export async function finishMaterialUpload(admin: AppUser, materialId: string) {
  const material = await prisma.lessonMaterial.findUnique({ where: { id: materialId } });
  if (!material) throw new ApiError("NOT_FOUND", "Materiali nuk u gjet.");
  if (material.status === "READY") return { status: "READY" as const };

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

export async function deleteMaterial(admin: AppUser, materialId: string) {
  const material = await prisma.lessonMaterial.findUnique({ where: { id: materialId }, select: { objectKey: true, lessonId: true } });
  if (!material) throw new ApiError("NOT_FOUND", "Materiali nuk u gjet.");
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

/** Short-lived URL, re-checked against the access policy on every request. */
export async function grantMaterialAccess(user: AppUser, lessonId: string, materialId: string, mode: "view" | "download", now = new Date()) {
  const { access } = await requireLessonCapability(user, lessonId, "VIEW_CONTENT", now);
  const material = await prisma.lessonMaterial.findFirst({ where: { id: materialId, lessonId, status: "READY" } });
  if (!material) throw new ApiError("NOT_FOUND", "Materiali nuk u gjet.");

  const inline = mode === "view" && isInlineSafe("material", material.mimeType);
  const url = await presignGet({
    key: material.objectKey,
    expiresIn: grantLifetimeSeconds(access, READ_URL_MAX_TTL_SECONDS, now),
    contentType: material.mimeType,
    filename: material.displayName,
    disposition: inline ? "inline" : "attachment",
  });
  return { url };
}
