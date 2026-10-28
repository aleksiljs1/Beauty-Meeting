import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { createLesson, createUser, resetDatabase } from "@/test/fixtures";

const materials = await import("./materials");
const files = await import("./material-files");
const lessons = await import("./lessons");
const { listMaterialLibrary } = await import("@/server/queries/admin");
const recordings = await import("./recordings");
const { prisma } = await import("@/server/db");

const DAY = 86_400_000;
const pdf = new TextEncoder().encode("%PDF-1.7\n% sample lesson handout\n");
const mp4 = new Uint8Array([0, 0, 0, 0x20, ...new TextEncoder().encode("ftypisom"), ...new Uint8Array(64)]);

let admin: Awaited<ReturnType<typeof createUser>>;
let student: Awaited<ReturnType<typeof createUser>>;
let lesson: Awaited<ReturnType<typeof createLesson>>;

beforeEach(async () => {
  await resetDatabase();
  admin = await createUser("admin");
  student = await createUser("student");
  lesson = await createLesson(admin.id);
  await prisma.lessonEnrollment.create({ data: { lessonId: lesson.id, userId: student.id, source: "ADMIN" } });
});

type Started = Awaited<ReturnType<typeof files.startFileUpload>>;

/** Uploads into a lesson (as from the lesson page) and returns the library file and its lesson link. */
async function startInLesson(lessonId: string, file: { filename: string; mimeType: string; sizeBytes: number }) {
  const started = await files.startFileUpload(admin, file, lessonId);
  const link = await prisma.lessonMaterial.findFirstOrThrow({ where: { fileId: started.fileId, lessonId } });
  return { ...started, materialId: link.id };
}

async function putSingle(started: Started, bytes: Uint8Array<ArrayBuffer>) {
  if (started.method !== "single") throw new Error("expected a single-PUT upload");
  const put = await fetch(started.uploadUrl, { method: "PUT", body: bytes, headers: started.headers });
  expect(put.ok).toBe(true);
}

/** Documents use one presigned PUT. */
async function uploadMaterial(bytes: Uint8Array<ArrayBuffer>, filename = "Udhëzuesi.pdf", lessonId = lesson.id) {
  const started = await startInLesson(lessonId, { filename, mimeType: "application/pdf", sizeBytes: bytes.byteLength });
  await putSingle(started, bytes);
  return started;
}

describe("lesson materials", () => {
  it("becomes visible to students only after verified finalization", async () => {
    const { fileId, materialId } = await uploadMaterial(pdf);
    expect(await materials.listMaterials(student, lesson.id)).toHaveLength(0); // still PENDING

    await files.finishFileUpload(admin, fileId);
    const list = await materials.listMaterials(student, lesson.id);
    expect(list).toMatchObject([{ id: materialId, fileId, displayName: "Udhëzuesi.pdf", viewable: true }]);

    const { url } = await materials.grantMaterialAccess(student, lesson.id, materialId, "view");
    const file = await fetch(url);
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(pdf);
  });

  it("rejects a file whose bytes don't match its declared type", async () => {
    const fake = new TextEncoder().encode("<html><script>alert(1)</script>");
    const { fileId } = await uploadMaterial(fake, "leksioni.pdf");
    await expect(files.finishFileUpload(admin, fileId)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(await prisma.materialFile.findUniqueOrThrow({ where: { id: fileId } })).toMatchObject({ status: "FAILED" });
  });

  it("refuses disallowed types before anything is uploaded", async () => {
    await expect(files.startFileUpload(admin, { filename: "setup.exe", mimeType: "application/octet-stream", sizeBytes: 10 }, lesson.id)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(await prisma.materialFile.count()).toBe(0);
  });

  it("issues no new grants after expiry or revocation, or to unrelated students", async () => {
    const { fileId, materialId } = await uploadMaterial(pdf);
    await files.finishFileUpload(admin, fileId);

    await expect(materials.grantMaterialAccess(student, lesson.id, materialId, "view", lesson.accessExpiresAt)).rejects.toMatchObject({
      code: "LESSON_ACCESS_EXPIRED",
    });
    await expect(materials.grantMaterialAccess(await createUser("student"), lesson.id, materialId, "view")).rejects.toMatchObject({
      code: "LESSON_NOT_AVAILABLE",
    });
    await prisma.lessonEnrollment.updateMany({ data: { revokedAt: new Date() } });
    await expect(materials.grantMaterialAccess(student, lesson.id, materialId, "view")).rejects.toMatchObject({ code: "LESSON_NOT_AVAILABLE" });
  });

  it("cannot reach another lesson's material through a lesson the student can access", async () => {
    const other = await createLesson(admin.id);
    const { fileId, materialId } = await uploadMaterial(pdf, "a.pdf", other.id);
    await files.finishFileUpload(admin, fileId);

    await expect(materials.grantMaterialAccess(student, lesson.id, materialId, "view")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("bounds the grant by the student's remaining access", async () => {
    const { fileId, materialId } = await uploadMaterial(pdf);
    await files.finishFileUpload(admin, fileId);
    const tenSecondsLeft = new Date(lesson.accessExpiresAt.getTime() - 10_000);
    const { url } = await materials.grantMaterialAccess(student, lesson.id, materialId, "view", tenSecondsLeft);
    expect(new URL(url).searchParams.get("X-Amz-Expires")).toBe("10");
  });
});

describe("materials library", () => {
  it("reuses one uploaded file in another lesson without uploading it again", async () => {
    const { fileId } = await uploadMaterial(pdf);
    await files.finishFileUpload(admin, fileId);
    const next = await createLesson(admin.id);
    await prisma.lessonEnrollment.create({ data: { lessonId: next.id, userId: student.id, source: "ADMIN" } });

    await materials.attachFiles(admin, next.id, [fileId]);
    await materials.attachFiles(admin, next.id, [fileId]); // already there: no duplicate
    const [shown] = await materials.listMaterials(student, next.id);
    expect(shown).toMatchObject({ fileId, displayName: "Udhëzuesi.pdf" });
    const { url } = await materials.grantMaterialAccess(student, next.id, shown.id, "download");
    expect(new Uint8Array(await (await fetch(url)).arrayBuffer())).toEqual(pdf);
    expect(await prisma.materialFile.count()).toBe(1);

    // A new name shows everywhere the file is used.
    await files.renameFile(fileId, "Udhëzuesi 2026.pdf", admin);
    expect((await materials.listMaterials(student, lesson.id))[0].displayName).toBe("Udhëzuesi 2026.pdf");
  });

  it("keeps the file in the library when it's removed from a lesson or the lesson is deleted", async () => {
    const { fileId, materialId } = await uploadMaterial(pdf);
    await files.finishFileUpload(admin, fileId);
    await materials.removeMaterial(admin, materialId);
    expect(await materials.listMaterials(student, lesson.id)).toHaveLength(0);

    const draft = await createLesson(admin.id, { publication: "DRAFT" });
    await materials.attachFiles(admin, draft.id, [fileId]);
    await lessons.deleteDraftLesson(draft.id, admin);
    const [kept] = await listMaterialLibrary();
    expect(kept).toMatchObject({ id: fileId, status: "READY", lessons: [] });
    const { url } = await materials.previewFile(fileId);
    expect((await fetch(url)).ok).toBe(true);
  });

  it("uploads straight into the library, and deleting a file removes it from every lesson", async () => {
    const started = await files.startFileUpload(admin, { filename: "Lista e çmimeve.pdf", mimeType: "application/pdf", sizeBytes: pdf.byteLength });
    await putSingle(started, pdf);
    await expect(materials.attachFiles(admin, lesson.id, [started.fileId])).rejects.toMatchObject({ code: "VALIDATION_FAILED" }); // not verified yet
    await files.finishFileUpload(admin, started.fileId);
    await materials.attachFiles(admin, lesson.id, [started.fileId]);
    expect(await listMaterialLibrary({ q: "çmimeve" })).toMatchObject([{ lessons: [{ id: lesson.id }] }]);

    await files.deleteFile(admin, started.fileId);
    expect(await materials.listMaterials(student, lesson.id)).toHaveLength(0);
    expect(await listMaterialLibrary()).toHaveLength(0);
  });
});

describe("video materials (MP4, multipart)", () => {
  const MB = 1024 * 1024;
  const start = (file: { filename: string; mimeType: string; sizeBytes: number }) => files.startFileUpload(admin, file, lesson.id);

  async function uploadVideoMaterial(bytes: Uint8Array<ArrayBuffer>, filename = "Teknika e grimit.mp4") {
    const started = await startInLesson(lesson.id, { filename, mimeType: "video/mp4", sizeBytes: bytes.byteLength });
    if (started.method !== "multipart") throw new Error("expected a multipart upload");
    expect(started.partCount).toBe(1);
    const [part] = await files.presignFileParts(started.fileId, [1]);
    const put = await fetch(part.url, { method: "PUT", body: bytes });
    expect(put.ok).toBe(true);
    return { fileId: started.fileId, materialId: started.materialId, etag: put.headers.get("etag") ?? "" };
  }

  it("applies per-type size limits: 4 GB for video, 100 MB for documents, and 50 MB for images", async () => {
    const video = await start({ filename: "demo.mp4", mimeType: "video/mp4", sizeBytes: 200 * MB });
    expect(video).toMatchObject({ method: "multipart", partCount: 4 });
    await files.deleteFile(admin, video.fileId);

    await expect(start({ filename: "demo.mp4", mimeType: "video/mp4", sizeBytes: 4 * 1024 * MB + 1 })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      message: expect.stringContaining("4 GB"),
    });
    await expect(start({ filename: "a.pdf", mimeType: "application/pdf", sizeBytes: 100 * MB + 1 })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      message: expect.stringContaining("100 MB"),
    });
    await expect(start({ filename: "a.png", mimeType: "image/png", sizeBytes: 50 * MB + 1 })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      message: expect.stringContaining("50 MB"),
    });
    expect(await start({ filename: "a.pdf", mimeType: "application/pdf", sizeBytes: 1000 })).toMatchObject({ method: "single" });
    // Other video containers stay out of the allowlist.
    await expect(start({ filename: "klip.mov", mimeType: "video/quicktime", sizeBytes: 1000 })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("becomes READY after completion + verification and streams with Range requests", async () => {
    const { fileId, materialId, etag } = await uploadVideoMaterial(mp4);
    expect(await materials.listMaterials(student, lesson.id)).toHaveLength(0); // still PENDING

    await expect(files.finishFileUpload(admin, fileId)).rejects.toMatchObject({ code: "VALIDATION_FAILED" }); // parts missing
    await files.finishFileUpload(admin, fileId, [{ partNumber: 1, etag }]);
    expect(await prisma.materialFile.findUniqueOrThrow({ where: { id: fileId } })).toMatchObject({ status: "READY", uploadId: null });
    expect(await materials.listMaterials(student, lesson.id)).toMatchObject([{ id: materialId, mimeType: "video/mp4", viewable: true }]);

    // Watching: inline, playback-length URL (renewed by the player) and seekable.
    const view = await materials.grantMaterialAccess(student, lesson.id, materialId, "view");
    expect(view.expiresInSeconds).toBe(300);
    expect(new URL(view.url).searchParams.get("X-Amz-Expires")).toBe("300");
    const range = await fetch(view.url, { headers: { Range: "bytes=4-11" } });
    expect(range.status).toBe(206);
    expect(range.headers.get("content-type")).toBe("video/mp4");
    expect(range.headers.get("content-disposition")).toMatch(/^inline/);
    expect(new TextDecoder().decode(await range.arrayBuffer())).toBe("ftypisom");

    // Downloading: an attachment with the usual 60 s grant.
    const download = await materials.grantMaterialAccess(student, lesson.id, materialId, "download");
    expect(new URL(download.url).searchParams.get("X-Amz-Expires")).toBe("60");
    const file = await fetch(download.url);
    expect(file.headers.get("content-disposition")).toMatch(/^attachment/);
  });

  it("marks a non-MP4 upload declared as video as failed", async () => {
    const { fileId, etag } = await uploadVideoMaterial(pdf, "video.mp4");
    await expect(files.finishFileUpload(admin, fileId, [{ partNumber: 1, etag }])).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(await prisma.materialFile.findUniqueOrThrow({ where: { id: fileId } })).toMatchObject({ status: "FAILED" });
    expect(await materials.listMaterials(student, lesson.id)).toHaveLength(0);
  });

  it("cancelling (deleting) an unfinished upload aborts it", async () => {
    const { fileId } = await uploadVideoMaterial(mp4);
    await files.deleteFile(admin, fileId);
    await expect(files.presignFileParts(fileId, [1])).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects part numbers outside the declared size", async () => {
    const { fileId } = await uploadVideoMaterial(mp4);
    await expect(files.presignFileParts(fileId, [2])).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("enforces the access deadline: grants shrink near it and stop at it", async () => {
    const { fileId, materialId, etag } = await uploadVideoMaterial(mp4);
    await files.finishFileUpload(admin, fileId, [{ partNumber: 1, etag }]);

    const tenSecondsLeft = new Date(lesson.accessExpiresAt.getTime() - 10_000);
    const near = await materials.grantMaterialAccess(student, lesson.id, materialId, "view", tenSecondsLeft);
    expect(near.expiresInSeconds).toBe(10);
    expect(new URL(near.url).searchParams.get("X-Amz-Expires")).toBe("10");

    for (const mode of ["view", "download"] as const) {
      await expect(materials.grantMaterialAccess(student, lesson.id, materialId, mode, lesson.accessExpiresAt)).rejects.toMatchObject({
        code: "LESSON_ACCESS_EXPIRED",
      });
    }
    // A personal deadline (shorter than the lesson's) is honoured as well.
    await prisma.lessonEnrollment.updateMany({ where: { userId: student.id }, data: { accessExpiresAt: new Date(Date.now() - 1000) } });
    await expect(materials.grantMaterialAccess(student, lesson.id, materialId, "view")).rejects.toMatchObject({ code: "LESSON_ACCESS_EXPIRED" });
  });
});

describe("manual recording upload", () => {
  async function uploadRecording(bytes: Uint8Array<ArrayBuffer>) {
    const started = await recordings.startRecordingUpload(admin, lesson.id, { filename: "Mësimi 1.mp4", mimeType: "video/mp4", sizeBytes: bytes.byteLength });
    expect(started.partCount).toBe(1);
    const [part] = await recordings.presignRecordingParts(started.recordingId, [1]);
    const put = await fetch(part.url, { method: "PUT", body: bytes });
    expect(put.ok).toBe(true);
    return { recordingId: started.recordingId, etag: put.headers.get("etag") ?? "" };
  }

  it("goes READY only after completion and verification, then plays for enrolled students", async () => {
    const { recordingId, etag } = await uploadRecording(mp4);
    expect(await recordings.listRecordings(student, lesson.id)).toHaveLength(0);

    await recordings.completeRecordingUpload(admin, recordingId, [{ partNumber: 1, etag }]);
    expect(await recordings.listRecordings(student, lesson.id)).toMatchObject([{ id: recordingId, status: "READY" }]);
    expect(await prisma.notification.count({ where: { userId: student.id, type: "RECORDING_READY" } })).toBe(1);

    const { url } = await recordings.grantRecordingPlayback(student, lesson.id, recordingId);
    const range = await fetch(url, { headers: { Range: "bytes=4-11" } });
    expect(range.status).toBe(206);
    expect(new TextDecoder().decode(await range.arrayBuffer())).toBe("ftypisom");
  });

  it("marks a non-MP4 upload as failed instead of ready", async () => {
    const { recordingId, etag } = await uploadRecording(pdf);
    await expect(recordings.completeRecordingUpload(admin, recordingId, [{ partNumber: 1, etag }])).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(await prisma.recording.findUniqueOrThrow({ where: { id: recordingId } })).toMatchObject({ status: "FAILED" });
  });

  it("stops playback grants at the deadline", async () => {
    const { recordingId, etag } = await uploadRecording(mp4);
    await recordings.completeRecordingUpload(admin, recordingId, [{ partNumber: 1, etag }]);
    await expect(recordings.grantRecordingPlayback(student, lesson.id, recordingId, new Date(lesson.accessExpiresAt.getTime() + DAY))).rejects.toMatchObject({
      code: "LESSON_ACCESS_EXPIRED",
    });
  });
});
