import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { createLesson, createUser, resetDatabase } from "@/test/fixtures";

const { deleteExpiredRecordings, RECORDING_KEEP_AFTER_EXPIRY_MS } = await import("./recordings");
const { completeMultipart, headObject, newObjectKey, startMultipart, uploadPart } = await import("@/server/storage/storage");
const { prisma } = await import("@/server/db");

const DAY = 24 * 60 * 60_000;
let adminId: string;

beforeEach(async () => {
  await resetDatabase();
  adminId = (await createUser("admin")).id;
});

/** A lesson whose access ended `daysAgo` days ago (negative: still open), with one stored recording. */
async function lessonWithRecording(daysAgo: number) {
  const accessExpiresAt = new Date(Date.now() - daysAgo * DAY);
  const start = new Date(accessExpiresAt.getTime() - 7 * DAY);
  const lesson = await createLesson(adminId, {
    scheduledStartAt: start,
    scheduledEndAt: new Date(start.getTime() + 2 * 60 * 60_000),
    joinOpensAt: new Date(start.getTime() - 15 * 60_000),
    accessExpiresAt,
    meetingStatus: "ENDED",
  });
  const key = newObjectKey("recordings", lesson.id);
  const uploadId = await startMultipart(key, "video/mp4");
  const etag = await uploadPart(key, uploadId, 1, new Uint8Array(1024));
  await completeMultipart(key, uploadId, [{ partNumber: 1, etag }]);
  const recording = await prisma.recording.create({
    data: { lessonId: lesson.id, source: "UPLOAD", status: "READY", objectKey: key, mimeType: "video/mp4", sizeBytes: BigInt(1024), readyAt: new Date() },
  });
  return { lesson, recording, key };
}

describe("recordings of expired lessons", () => {
  it("are deleted from storage a day after the lesson's access ends, and only then", async () => {
    const expired = await lessonWithRecording(2);
    const justExpired = await lessonWithRecording(0.5); // within the day the admin has to extend it
    const open = await lessonWithRecording(-3);

    expect(await deleteExpiredRecordings()).toBe(1);

    expect(await prisma.recording.findUnique({ where: { id: expired.recording.id } })).toBeNull();
    expect(await headObject(expired.key)).toBeNull();
    for (const kept of [justExpired, open]) {
      expect(await prisma.recording.findUnique({ where: { id: kept.recording.id } })).not.toBeNull();
      expect(await headObject(kept.key)).not.toBeNull();
    }
    expect(await prisma.auditLog.count({ where: { action: "recording.expired_delete", targetId: expired.lesson.id } })).toBe(1);

    // The lesson itself stays; a second run finds nothing more.
    expect(await prisma.lesson.count({ where: { id: expired.lesson.id } })).toBe(1);
    expect(await deleteExpiredRecordings()).toBe(0);
    expect(await deleteExpiredRecordings(new Date(Date.now() + RECORDING_KEEP_AFTER_EXPIRY_MS))).toBe(1); // the next day: the second one
  });

  it("leaves a Zoom file that is being copied right now for the next run", async () => {
    const { recording } = await lessonWithRecording(2);
    await prisma.recording.update({ where: { id: recording.id }, data: { source: "ZOOM", status: "IMPORTING" } });
    expect(await deleteExpiredRecordings()).toBe(0);
  });
});
