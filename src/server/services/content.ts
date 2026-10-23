import "server-only";
import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { adminContent } from "@/i18n/admin-content";
import type { CourseInput, GalleryItemInput, ServiceInput, SettingsInput } from "@/lib/content-schemas";
import { readImageDimensions } from "@/lib/image-dimensions";
import { parseOpeningHours } from "@/lib/public-content";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/http";
import { PUBLIC_CONTENT_TAG } from "@/server/queries/public";
import { bytesMatch, MAX_UPLOAD_BYTES, ruleForDeclaredFile, SNIFF_BYTES } from "@/server/storage/file-types";
import { GALLERY_IMAGE_TYPES, isGalleryKey } from "@/server/storage/public-media";
import { deleteObject, headObject, newObjectKey, presignPut, readObjectHead } from "@/server/storage/storage";
import { audit } from "./audit";

/**
 * Public website content (settings, services, courses, gallery), edited by the admin.
 * Route handlers call `revalidatePublicContent()` after every successful change.
 */

const e = adminContent.errors;
const LIST_LIMIT = 100;
const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

/** Route ids are UUIDs; anything else is simply "not found" (never a database error). */
export function parseContentId(id: string): string {
  if (!z.uuid().safeParse(id).success) throw new ApiError("NOT_FOUND", e.notFound);
  return id;
}

/** Expires cached public data immediately (admins expect to see their change on the next visit). */
export function revalidatePublicContent() {
  revalidateTag(PUBLIC_CONTENT_TAG, { expire: 0 });
  revalidatePath("/", "layout");
}

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
const isMissing = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";

async function rethrowMissing<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (isMissing(error)) throw new ApiError("NOT_FOUND", e.notFound);
    throw error;
  }
}

// --- Settings ------------------------------------------------------------------------------

export async function getSettingsForEdit(): Promise<SettingsInput> {
  const row = await prisma.academySettings.findUnique({ where: { id: 1 } });
  return {
    name: row?.name ?? "",
    tagline: row?.tagline ?? "",
    about: row?.about ?? "",
    address: row?.address ?? "",
    phone: row?.phone ?? "",
    email: row?.email ?? "",
    whatsapp: row?.whatsapp ?? "",
    mapUrl: row?.mapUrl ?? "",
    instagramUrl: row?.instagramUrl ?? "",
    facebookUrl: row?.facebookUrl ?? "",
    openingHours: parseOpeningHours(row?.openingHours),
  };
}

export async function updateSettings(admin: AppUser, input: SettingsInput) {
  const data = {
    name: input.name.trim(),
    tagline: orNull(input.tagline),
    about: orNull(input.about),
    address: orNull(input.address),
    phone: orNull(input.phone),
    email: orNull(input.email),
    whatsapp: orNull(input.whatsapp),
    mapUrl: orNull(input.mapUrl),
    instagramUrl: orNull(input.instagramUrl),
    facebookUrl: orNull(input.facebookUrl),
    openingHours: input.openingHours.filter((row) => row.days || row.hours),
  };
  await prisma.academySettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  await audit(admin.id, "content.settings.update", "academySettings", "1");
  return getSettingsForEdit();
}

// --- Shared ordering -----------------------------------------------------------------------

/** The client sends the complete new order; a stale or partial list is rejected. */
function assertCompleteOrder(existing: { id: string }[], ids: string[]) {
  const known = new Set(existing.map((row) => row.id));
  if (new Set(ids).size !== ids.length || existing.length !== ids.length || ids.some((id) => !known.has(id))) {
    throw new ApiError("CONFLICT", e.staleOrder);
  }
}

const after = (last: { _max: { position: number | null } }) => (last._max.position ?? -1) + 1;

// --- Services ------------------------------------------------------------------------------

const serviceSelect = { id: true, title: true, description: true, priceText: true, isPublished: true, position: true } as const;

export async function listServicesForAdmin() {
  return prisma.service.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: serviceSelect, take: LIST_LIMIT });
}

const serviceData = (input: Partial<ServiceInput>) => ({
  ...(input.title !== undefined && { title: input.title.trim() }),
  ...(input.description !== undefined && { description: orNull(input.description) }),
  ...(input.priceText !== undefined && { priceText: orNull(input.priceText) }),
  ...(input.isPublished !== undefined && { isPublished: input.isPublished }),
});

export async function createService(admin: AppUser, input: ServiceInput) {
  const service = await prisma.service.create({
    data: { ...serviceData(input), title: input.title.trim(), position: after(await prisma.service.aggregate({ _max: { position: true } })) },
    select: serviceSelect,
  });
  await audit(admin.id, "content.service.create", "service", service.id);
  return service;
}

export async function updateService(admin: AppUser, id: string, input: Partial<ServiceInput>) {
  const service = await rethrowMissing(prisma.service.update({ where: { id }, data: serviceData(input), select: serviceSelect }));
  await audit(admin.id, "content.service.update", "service", id);
  return service;
}

export async function deleteService(admin: AppUser, id: string) {
  await rethrowMissing(prisma.service.delete({ where: { id } }));
  await audit(admin.id, "content.service.delete", "service", id);
}

export async function reorderServices(admin: AppUser, ids: string[]) {
  assertCompleteOrder(await prisma.service.findMany({ select: { id: true } }), ids);
  await prisma.$transaction(ids.map((id, position) => prisma.service.update({ where: { id }, data: { position } })));
  await audit(admin.id, "content.service.reorder", "service", null);
}

// --- Courses -------------------------------------------------------------------------------

const courseSelect = {
  id: true,
  title: true,
  slug: true,
  summary: true,
  description: true,
  durationText: true,
  priceText: true,
  isPublic: true,
  position: true,
} as const;

export async function listCoursesForAdmin() {
  return prisma.course.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: courseSelect, take: LIST_LIMIT });
}

const courseData = (input: Partial<CourseInput>) => ({
  ...(input.title !== undefined && { title: input.title.trim() }),
  ...(input.slug !== undefined && { slug: input.slug }),
  ...(input.summary !== undefined && { summary: orNull(input.summary) }),
  ...(input.description !== undefined && { description: orNull(input.description) }),
  ...(input.durationText !== undefined && { durationText: orNull(input.durationText) }),
  ...(input.priceText !== undefined && { priceText: orNull(input.priceText) }),
  ...(input.isPublic !== undefined && { isPublic: input.isPublic }),
});

async function withSlugCheck<T>(promise: Promise<T>): Promise<T> {
  try {
    return await rethrowMissing(promise);
  } catch (error) {
    if (isUniqueViolation(error)) throw new ApiError("CONFLICT", e.slugTaken);
    throw error;
  }
}

export async function createCourse(admin: AppUser, input: CourseInput) {
  const course = await withSlugCheck(
    prisma.course.create({
      data: { ...courseData(input), title: input.title.trim(), slug: input.slug, position: after(await prisma.course.aggregate({ _max: { position: true } })) },
      select: courseSelect,
    }),
  );
  await audit(admin.id, "content.course.create", "course", course.id);
  return course;
}

export async function updateCourse(admin: AppUser, id: string, input: Partial<CourseInput>) {
  const course = await withSlugCheck(prisma.course.update({ where: { id }, data: courseData(input), select: courseSelect }));
  await audit(admin.id, "content.course.update", "course", id);
  return course;
}

export async function deleteCourse(admin: AppUser, id: string) {
  await rethrowMissing(prisma.course.delete({ where: { id } }));
  await audit(admin.id, "content.course.delete", "course", id);
}

export async function reorderCourses(admin: AppUser, ids: string[]) {
  assertCompleteOrder(await prisma.course.findMany({ select: { id: true } }), ids);
  await prisma.$transaction(ids.map((id, position) => prisma.course.update({ where: { id }, data: { position } })));
  await audit(admin.id, "content.course.reorder", "course", null);
}

// --- Gallery -------------------------------------------------------------------------------

/** Enough bytes to sniff the type and find JPEG dimensions behind typical EXIF blocks. */
const DIMENSION_PROBE_BYTES = 64 * 1024;

const galleryAdminSelect = {
  id: true,
  alt: true,
  caption: true,
  width: true,
  height: true,
  isPublished: true,
  position: true,
  showInGallery: true,
  showOnHomeHero: true,
  showOnHomeGallery: true,
  showOnAbout: true,
} as const;

/** Admin list. Exposes an id-based preview path, never the storage key or a presigned URL. */
export async function listGalleryForAdmin() {
  const rows = await prisma.galleryItem.findMany({
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: galleryAdminSelect,
    take: LIST_LIMIT,
  });
  return rows.map(withPreview);
}

const withPreview = <T extends { id: string }>(row: T) => ({ ...row, previewSrc: `/admin/permbajtja/galeria/${row.id}/foto` });

/** Step 1: validate the declared file and hand out a presigned PUT for a fresh `gallery/` key. */
export async function startGalleryUpload(file: { filename: string; mimeType: string; sizeBytes: number }) {
  const rule = ruleForDeclaredFile("image", file.filename, file.mimeType);
  if (!rule) throw new ApiError("VALIDATION_FAILED", adminContent.gallery.badType);
  if (file.sizeBytes <= 0 || file.sizeBytes > MAX_UPLOAD_BYTES.image) throw new ApiError("VALIDATION_FAILED", adminContent.gallery.tooLarge);
  const uploadKey = newObjectKey("gallery");
  const uploadUrl = await presignPut({ key: uploadKey, contentType: rule.mime, contentLength: file.sizeBytes });
  return { uploadKey, uploadUrl, headers: { "Content-Type": rule.mime } };
}

/** Step 2: verify what actually landed in storage (size, type, magic bytes), then create the item. */
export async function createGalleryItem(
  admin: AppUser,
  input: GalleryItemInput & { uploadKey: string; mimeType: string; sizeBytes: number },
) {
  if (!isGalleryKey(input.uploadKey)) throw new ApiError("VALIDATION_FAILED", e.badImage);
  if (await prisma.galleryItem.findUnique({ where: { imageKey: input.uploadKey }, select: { id: true } })) {
    throw new ApiError("CONFLICT", e.uploadExists);
  }

  const head = await headObject(input.uploadKey);
  let dimensions: { width: number; height: number } | null = null;
  let valid =
    head !== null &&
    head.size === input.sizeBytes &&
    head.size <= MAX_UPLOAD_BYTES.image &&
    head.contentType === input.mimeType &&
    (GALLERY_IMAGE_TYPES as readonly string[]).includes(input.mimeType);
  if (valid && head) {
    const probe = await readObjectHead(input.uploadKey, Math.min(head.size, DIMENSION_PROBE_BYTES));
    valid = probe.byteLength >= SNIFF_BYTES && bytesMatch("image", input.mimeType, probe);
    dimensions = valid ? readImageDimensions(probe) : null;
  }
  if (!valid) {
    if (head) await deleteObject(input.uploadKey).catch((error) => console.error("[storage] rejected gallery object", error));
    throw new ApiError("VALIDATION_FAILED", e.badImage);
  }

  const item = await prisma.$transaction(async (tx) => {
    if (input.showOnHomeHero) {
      await tx.galleryItem.updateMany({ where: { showOnHomeHero: true }, data: { showOnHomeHero: false } });
    }
    if (input.showOnAbout) {
      await tx.galleryItem.updateMany({ where: { showOnAbout: true }, data: { showOnAbout: false } });
    }
    return tx.galleryItem.create({
      data: {
        imageKey: input.uploadKey,
        alt: input.alt.trim(),
        caption: orNull(input.caption),
        isPublished: input.isPublished,
        showInGallery: input.showInGallery,
        showOnHomeHero: input.showOnHomeHero,
        showOnHomeGallery: input.showOnHomeGallery,
        showOnAbout: input.showOnAbout,
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
        position: after(await tx.galleryItem.aggregate({ _max: { position: true } })),
      },
      select: galleryAdminSelect,
    });
  });
  await audit(admin.id, "content.gallery.create", "galleryItem", item.id);
  return withPreview(item);
}

export async function updateGalleryItem(admin: AppUser, id: string, input: Partial<GalleryItemInput>) {
  const item = await rethrowMissing(prisma.$transaction(async (tx) => {
    if (input.showOnHomeHero) {
      await tx.galleryItem.updateMany({ where: { id: { not: id }, showOnHomeHero: true }, data: { showOnHomeHero: false } });
    }
    if (input.showOnAbout) {
      await tx.galleryItem.updateMany({ where: { id: { not: id }, showOnAbout: true }, data: { showOnAbout: false } });
    }
    return tx.galleryItem.update({
      where: { id },
      data: {
        ...(input.alt !== undefined && { alt: input.alt.trim() }),
        ...(input.caption !== undefined && { caption: orNull(input.caption) }),
        ...(input.isPublished !== undefined && { isPublished: input.isPublished }),
        ...(input.showInGallery !== undefined && { showInGallery: input.showInGallery }),
        ...(input.showOnHomeHero !== undefined && { showOnHomeHero: input.showOnHomeHero }),
        ...(input.showOnHomeGallery !== undefined && { showOnHomeGallery: input.showOnHomeGallery }),
        ...(input.showOnAbout !== undefined && { showOnAbout: input.showOnAbout }),
      },
      select: galleryAdminSelect,
    });
  }));
  await audit(admin.id, "content.gallery.update", "galleryItem", id);
  return withPreview(item);
}

export async function deleteGalleryItem(admin: AppUser, id: string) {
  const item = await prisma.galleryItem.findUnique({ where: { id }, select: { imageKey: true } });
  if (!item) throw new ApiError("NOT_FOUND", e.notFound);
  await prisma.galleryItem.delete({ where: { id } });
  if (isGalleryKey(item.imageKey)) {
    await deleteObject(item.imageKey).catch((error) => console.error("[storage] orphan gallery object", id, error));
  }
  await audit(admin.id, "content.gallery.delete", "galleryItem", id);
}

export async function reorderGallery(admin: AppUser, ids: string[]) {
  assertCompleteOrder(await prisma.galleryItem.findMany({ select: { id: true } }), ids);
  await prisma.$transaction(ids.map((id, position) => prisma.galleryItem.update({ where: { id }, data: { position } })));
  await audit(admin.id, "content.gallery.reorder", "galleryItem", null);
}

/** Storage key for the admin preview route (server-side only, never sent to the client). */
export async function galleryKeyForAdmin(id: string): Promise<string | null> {
  const item = await prisma.galleryItem.findUnique({ where: { id }, select: { imageKey: true } });
  return item?.imageKey ?? null;
}
