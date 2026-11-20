import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { createLesson, createUser, resetDatabase } from "@/test/fixtures";

const { deleteAbandonedUploads, ABANDONED_UPLOAD_TTL_MS } = await import("./upload-cleanup");
const { completeMultipart, headObject, newObjectKey, startMultipart, uploadPart } = await import("@/server/storage/storage");
const { prisma } = await import("@/server/db");

const HOUR = 60 * 60_000;
const PART = new Uint8Array(1024);
let adminId: string;
let lessonId: string;

beforeEach(async () => {
  await resetDatabase();
  adminId = (await createUser("admin")).id;
  lessonId = (await createLesson(adminId)).id;
});

const ago = (hours: number) => new Date(Date.now() - hours * HOUR);

/** An open multipart upload with one part already sent, as a browser leaves it when the tab closes. */
async function openUpload(prefix: "materials" | "recordings") {
  const key = newObjectKey(prefix, lessonId);
  const uploadId = await startMultipart(key, "video/mp4");
  await uploadPart(key, uploadId, 1, PART);
  return { key, uploadId };
}

/** A stored object (a finished upload). */
async function storedObject(prefix: "materials" | "recordings") {
  const key = newObjectKey(prefix, lessonId);
  const uploadId = await startMultipart(key, "video/mp4");
  const etag = await uploadPart(key, uploadId, 1, PART);
  await completeMultipart(key, uploadId, [{ partNumber: 1, etag }]);
  return key;
}

function materialFile(objectKey: string, data: { status: "PENDING" | "READY" | "FAILED"; uploadId?: string | null; createdAt: Date }) {
  return prisma.materialFile.create({
    data: { objectKey, displayName: "video.mp4", mimeType: "video/mp4", sizeBytes: BigInt(PART.byteLength), uploadedById: adminId, uploadId: data.uploadId ?? null, status: data.status, createdAt: data.createdAt },
  });
}

function recording(data: { source: "UPLOAD" | "ZOOM"; status: "IMPORTING" | "READY" | "FAILED"; objectKey: string; uploadId?: string | null; createdAt: Date; part: number }) {
  return prisma.recording.create({
    data: { lessonId, mimeType: "video/mp4", sizeBytes: BigInt(PART.byteLength), ...data, uploadId: data.uploadId ?? null },
  });
}

describe("abandoned uploads", () => {
  it("deletes material files left PENDING for over a day: aborts the multipart, deletes any object and the row", async () => {
    const multipart = await openUpload("materials");
    const abandonedVideo = await materialFile(multipart.key, { status: "PENDING", uploadId: multipart.uploadId, createdAt: ago(25) });
    await prisma.lessonMaterial.create({ data: { lessonId, fileId: abandonedVideo.id } });
    // A single-PUT file that was uploaded but never finalized.
    const putKey = await storedObject("materials");
    const abandonedPdf = await materialFile(putKey, { status: "PENDING", createdAt: ago(30) });

    const fresh = await openUpload("materials");
    const stillUploading = await materialFile(fresh.key, { status: "PENDING", uploadId: fresh.uploadId, createdAt: ago(2) });
    const readyKey = await storedObject("materials");
    const ready = await materialFile(readyKey, { status: "READY", createdAt: ago(48) });

    expect(await deleteAbandonedUploads()).toBe(2);

    expect(await prisma.materialFile.findMany({ where: { id: { in: [abandonedVideo.id, abandonedPdf.id] } } })).toEqual([]);
    expect(await prisma.lessonMaterial.count({ where: { fileId: abandonedVideo.id } })).toBe(0);
    await expect(uploadPart(multipart.key, multipart.uploadId, 2, PART)).rejects.toThrow(); // the multipart is gone
    expect(await headObject(putKey)).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "material.upload_abandoned" } })).toBe(2);

    // Kept: a recent upload (still usable) and a finished file.
    expect(await prisma.materialFile.count({ where: { id: { in: [stillUploading.id, ready.id] } } })).toBe(2);
    await uploadPart(fresh.key, fresh.uploadId, 2, PART);
    expect(await headObject(readyKey)).not.toBeNull();
  });

  it("deletes manual recording uploads stuck IMPORTING for over a day, never Zoom imports or failed/finished ones", async () => {
    const multipart = await openUpload("recordings");
    const abandoned = await recording({ source: "UPLOAD", status: "IMPORTING", objectKey: multipart.key, uploadId: multipart.uploadId, createdAt: ago(25), part: 1 });

    const fresh = await openUpload("recordings");
    const uploading = await recording({ source: "UPLOAD", status: "IMPORTING", objectKey: fresh.key, uploadId: fresh.uploadId, createdAt: ago(1), part: 2 });
    const zoom = await recording({ source: "ZOOM", status: "IMPORTING", objectKey: newObjectKey("recordings", lessonId), createdAt: ago(48), part: 3 });
    const failed = await recording({ source: "UPLOAD", status: "FAILED", objectKey: newObjectKey("recordings", lessonId), createdAt: ago(48), part: 4 });
    const readyKey = await storedObject("recordings");
    const ready = await recording({ source: "UPLOAD", status: "READY", objectKey: readyKey, createdAt: ago(48), part: 5 });

    expect(await deleteAbandonedUploads()).toBe(1);

    expect(await prisma.recording.findUnique({ where: { id: abandoned.id } })).toBeNull();
    await expect(uploadPart(multipart.key, multipart.uploadId, 2, PART)).rejects.toThrow();
    expect(await prisma.auditLog.count({ where: { action: "recording.upload_abandoned", targetId: lessonId } })).toBe(1);
    expect(await prisma.recording.count({ where: { id: { in: [uploading.id, zoom.id, failed.id, ready.id] } } })).toBe(4);
    expect(await headObject(readyKey)).not.toBeNull();

    // Nothing more now; the recent upload goes once it too is a day old.
    expect(await deleteAbandonedUploads()).toBe(0);
    expect(await deleteAbandonedUploads(new Date(Date.now() + ABANDONED_UPLOAD_TTL_MS))).toBe(1);
    expect(await prisma.recording.findUnique({ where: { id: uploading.id } })).toBeNull();
  });
});
