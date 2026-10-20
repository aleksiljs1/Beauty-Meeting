import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { createLesson, createUser, resetDatabase } from "@/test/fixtures";

const materials = await import("./materials");
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

async function uploadMaterial(bytes: Uint8Array, filename = "Udhëzuesi.pdf") {
  const started = await materials.startMaterialUpload(admin, lesson.id, { filename, mimeType: "application/pdf", sizeBytes: bytes.byteLength });
  const put = await fetch(started.uploadUrl, { method: "PUT", body: bytes, headers: started.headers });
  expect(put.ok).toBe(true);
  return started.materialId;
}

describe("lesson materials", () => {
  it("becomes visible to students only after verified finalization", async () => {
    const id = await uploadMaterial(pdf);
    expect(await materials.listMaterials(student, lesson.id)).toHaveLength(0); // still PENDING

    await materials.finishMaterialUpload(admin, id);
    const list = await materials.listMaterials(student, lesson.id);
    expect(list).toMatchObject([{ id, displayName: "Udhëzuesi.pdf", viewable: true }]);

    const { url } = await materials.grantMaterialAccess(student, lesson.id, id, "view");
    const file = await fetch(url);
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(pdf);
  });

  it("rejects a file whose bytes don't match its declared type", async () => {
    const fake = new TextEncoder().encode("<html><script>alert(1)</script>");
    const id = await uploadMaterial(fake, "leksioni.pdf");
    await expect(materials.finishMaterialUpload(admin, id)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(await prisma.lessonMaterial.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "FAILED" });
  });

  it("refuses disallowed types before anything is uploaded", async () => {
    await expect(
      materials.startMaterialUpload(admin, lesson.id, { filename: "setup.exe", mimeType: "application/octet-stream", sizeBytes: 10 }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("issues no new grants after expiry or revocation, or to unrelated students", async () => {
    const id = await uploadMaterial(pdf);
    await materials.finishMaterialUpload(admin, id);

    await expect(materials.grantMaterialAccess(student, lesson.id, id, "view", lesson.accessExpiresAt)).rejects.toMatchObject({
      code: "LESSON_ACCESS_EXPIRED",
    });
    await expect(materials.grantMaterialAccess(await createUser("student"), lesson.id, id, "view")).rejects.toMatchObject({
      code: "LESSON_NOT_AVAILABLE",
    });
    await prisma.lessonEnrollment.updateMany({ data: { revokedAt: new Date() } });
    await expect(materials.grantMaterialAccess(student, lesson.id, id, "view")).rejects.toMatchObject({ code: "LESSON_NOT_AVAILABLE" });
  });

  it("cannot reach another lesson's material through a lesson the student can access", async () => {
    const other = await createLesson(admin.id);
    const started = await materials.startMaterialUpload(admin, other.id, { filename: "a.pdf", mimeType: "application/pdf", sizeBytes: pdf.byteLength });
    await fetch(started.uploadUrl, { method: "PUT", body: pdf, headers: started.headers });
    await materials.finishMaterialUpload(admin, started.materialId);

    await expect(materials.grantMaterialAccess(student, lesson.id, started.materialId, "view")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("bounds the grant by the student's remaining access", async () => {
    const id = await uploadMaterial(pdf);
    await materials.finishMaterialUpload(admin, id);
    const tenSecondsLeft = new Date(lesson.accessExpiresAt.getTime() - 10_000);
    const { url } = await materials.grantMaterialAccess(student, lesson.id, id, "view", tenSecondsLeft);
    expect(new URL(url).searchParams.get("X-Amz-Expires")).toBe("10");
  });
});

describe("manual recording upload", () => {
  async function uploadRecording(bytes: Uint8Array) {
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
