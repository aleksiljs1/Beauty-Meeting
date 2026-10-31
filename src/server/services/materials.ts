import "server-only";
import { grantLifetimeSeconds } from "@/server/access/policy";
import { requireLessonCapability } from "@/server/access/lesson-access";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/http";
import { publishLessonChanged } from "@/server/realtime/publish";
import { isInlineSafe } from "@/server/storage/file-types";
import { presignGet, READ_URL_MAX_TTL_SECONDS } from "@/server/storage/storage";
import { audit } from "./audit";
import { linkFiles } from "./material-files";
import { PLAYBACK_URL_TTL_SECONDS } from "./recordings";

/**
 * Lesson materials: library files (material-files.ts) shown in a lesson. Students only ever
 * see READY files of a lesson they can currently access; removing a material from a lesson
 * keeps the file in the library.
 */

/** Students (and admins): a lesson's materials. Students see READY files only. */
export async function listMaterials(user: AppUser, lessonId: string) {
  await requireLessonCapability(user, lessonId, "VIEW_CONTENT");
  const rows = await prisma.lessonMaterial.findMany({
    where: { lessonId, ...(user.role === "admin" ? {} : { file: { status: "READY" } }) },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, createdAt: true, file: { select: { id: true, displayName: true, mimeType: true, sizeBytes: true, status: true } } },
  });
  return rows.map(({ id, createdAt, file }) => ({
    id,
    fileId: file.id,
    displayName: file.displayName,
    mimeType: file.mimeType,
    sizeBytes: Number(file.sizeBytes),
    status: file.status,
    createdAt,
    viewable: isInlineSafe("material", file.mimeType),
  }));
}

/** Adds library files that finished uploading to a lesson. */
export async function attachFiles(admin: AppUser, lessonId: string, fileIds: string[]) {
  const ids = [...new Set(fileIds)];
  if (!(await prisma.lesson.findUnique({ where: { id: lessonId }, select: { id: true } }))) throw new ApiError("NOT_FOUND", "Mësimi nuk u gjet.");
  if ((await prisma.materialFile.count({ where: { id: { in: ids }, status: "READY" } })) !== ids.length) {
    throw new ApiError("VALIDATION_FAILED", "Një ose më shumë materiale nuk u gjetën ose nuk janë gati.");
  }
  await linkFiles(lessonId, ids);
  await audit(admin.id, "material.attach", "lesson", lessonId, { fileIds: ids });
  await publishLessonChanged(lessonId);
}

/** Removes a material from its lesson; the file stays in the library. */
export async function removeMaterial(admin: AppUser, materialId: string) {
  const material = await prisma.lessonMaterial.findUnique({ where: { id: materialId }, select: { lessonId: true, fileId: true } });
  if (!material) throw new ApiError("NOT_FOUND", "Materiali nuk u gjet.");
  await prisma.lessonMaterial.delete({ where: { id: materialId } });
  await audit(admin.id, "material.remove", "lesson", material.lessonId, { fileId: material.fileId });
  await publishLessonChanged(material.lessonId);
}

const isVideo = (mime: string) => mime.startsWith("video/");

/**
 * Short-lived URL, re-checked against the access policy on every request. Watching a video
 * gets the recordings' playback lifetime (the player keeps issuing Range requests and renews
 * the grant before it expires); everything else, downloads included, gets at most 60 s.
 */
export async function grantMaterialAccess(user: AppUser, lessonId: string, materialId: string, mode: "view" | "download", now = new Date()) {
  const { access } = await requireLessonCapability(user, lessonId, "VIEW_CONTENT", now);
  const material = await prisma.lessonMaterial.findFirst({ where: { id: materialId, lessonId, file: { status: "READY" } }, select: { file: true } });
  if (!material) throw new ApiError("NOT_FOUND", "Materiali nuk u gjet.");
  const { file } = material;

  const inline = mode === "view" && isInlineSafe("material", file.mimeType);
  const ttl = inline && isVideo(file.mimeType) ? PLAYBACK_URL_TTL_SECONDS : READ_URL_MAX_TTL_SECONDS;
  const expiresIn = Math.min(grantLifetimeSeconds(access, ttl, now), ttl);
  const url = await presignGet({
    key: file.objectKey,
    expiresIn,
    maxTtlSeconds: ttl,
    contentType: file.mimeType,
    filename: file.displayName,
    disposition: inline ? "inline" : "attachment",
  });
  return { url, expiresInSeconds: expiresIn };
}

/** Admin preview of a library file, whether or not any lesson uses it. */
export async function previewFile(fileId: string, mode: "view" | "download" = "view") {
  const file = await prisma.materialFile.findFirst({ where: { id: fileId, status: "READY" } });
  if (!file) throw new ApiError("NOT_FOUND", "Materiali nuk u gjet.");
  const inline = mode === "view" && isInlineSafe("material", file.mimeType);
  const ttl = inline && isVideo(file.mimeType) ? PLAYBACK_URL_TTL_SECONDS : READ_URL_MAX_TTL_SECONDS;
  const url = await presignGet({ key: file.objectKey, expiresIn: ttl, maxTtlSeconds: ttl, contentType: file.mimeType, filename: file.displayName, disposition: inline ? "inline" : "attachment" });
  return { url, expiresInSeconds: ttl };
}
