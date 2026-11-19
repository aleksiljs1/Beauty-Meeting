import "dotenv/config";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser, resetDatabase } from "@/test/fixtures";

const { createLesson, createRepeatingLesson, updateLesson, setLessonPublication } = await import("./lessons");
const { grantMaterialAccess, listMaterials } = await import("./materials");
const { listStudentLessons, getClassroom } = await import("@/server/queries/portal");
const { getLessonProgress, getClassAlerts } = await import("@/server/queries/admin");
const { createZoomMeetingForLesson } = await import("@/server/zoom/meetings");
const { prisma } = await import("@/server/db");

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

let admin: Awaited<ReturnType<typeof createUser>>;
let student: Awaited<ReturnType<typeof createUser>>;

beforeEach(async () => {
  await resetDatabase();
  admin = await createUser("admin");
  student = await createUser("student");
});

/** An offline lesson as the form sends it: the end and join times are whatever; the server derives them. */
function offlineInput(from: Date | null, until = new Date(Date.now() + 30 * DAY)) {
  const start = from ?? new Date();
  return {
    title: "Kujdesi për lëkurën",
    format: "OFFLINE" as const,
    availableNow: from === null,
    scheduledStartAt: start,
    scheduledEndAt: start,
    joinOpensAt: start,
    accessExpiresAt: until,
  };
}

async function addMaterial(lessonId: string, name: string, position: number, mimeType = "application/pdf") {
  const file = await prisma.materialFile.create({
    data: { objectKey: `materials/${randomUUID()}`, displayName: name, mimeType, sizeBytes: BigInt(1000), status: "READY", uploadedById: admin.id },
  });
  return prisma.lessonMaterial.create({ data: { lessonId, fileId: file.id, position } });
}

describe("offline lessons", () => {
  it("stores the availability window as the lesson's span, without a meeting", async () => {
    const until = new Date(Date.now() + 10 * DAY);
    const { id } = await createLesson(offlineInput(null, until), false, admin, [student.id]);
    const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id } });
    expect(lesson).toMatchObject({ format: "OFFLINE", publication: "DRAFT", meetingStatus: "NOT_PROVISIONED", isDemo: false });
    expect(lesson.scheduledStartAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(lesson.joinOpensAt).toEqual(lesson.scheduledStartAt);
    expect(lesson.scheduledEndAt).toEqual(until);
    expect(lesson.accessExpiresAt).toEqual(until);
  });

  it("refuses repeats, a deadline before it appears, and Zoom meetings", async () => {
    await expect(createRepeatingLesson(offlineInput(null), { weekdays: [0], until: "2027-01-01" }, false, admin)).rejects.toThrow(/nuk përsëriten/);
    const from = new Date(Date.now() + 5 * DAY);
    await expect(createLesson(offlineInput(from, new Date(from.getTime() - HOUR)), false, admin)).rejects.toThrow();
    const { id } = await createLesson(offlineInput(null), false, admin);
    await setLessonPublication(id, "PUBLISHED", admin);
    await expect(createZoomMeetingForLesson(id, admin)).rejects.toThrow(/offline/);
  });

  it("doesn't count toward the limit of lessons at the same time, nor raise class alerts", async () => {
    for (let i = 0; i < 4; i++) {
      const { id } = await createLesson(offlineInput(null), false, admin);
      await setLessonPublication(id, "PUBLISHED", admin);
    }
    expect((await getClassAlerts(admin.id)).alerts).toEqual([]);
  });

  it("stays hidden from students until its date, then shows up to study", async () => {
    const from = new Date(Date.now() + 2 * DAY);
    const { id } = await createLesson(offlineInput(from), false, admin, [student.id]);
    await setLessonPublication(id, "PUBLISHED", admin);
    expect(await listStudentLessons(student)).toEqual([]);
    await expect(getClassroom(student, id)).rejects.toMatchObject({ code: "LESSON_NOT_AVAILABLE" });

    const later = new Date(from.getTime() + HOUR);
    const [card] = await listStudentLessons(student, later);
    expect(card).toMatchObject({ id, format: "OFFLINE", phase: "SELF_STUDY", canJoin: false, progress: { seen: 0, total: 0 } });

    // "Right away" brings it forward; it never pushes a visible lesson later.
    await updateLesson(id, { availableNow: true }, false, admin);
    const [now] = await listStudentLessons(student);
    expect(now.phase).toBe("SELF_STUDY");
  });

  it("marks materials seen when a student opens them, and shows the progress to the admin", async () => {
    const { id } = await createLesson(offlineInput(null), false, admin, [student.id]);
    await setLessonPublication(id, "PUBLISHED", admin);
    const first = await addMaterial(id, "Hapi 1.pdf", 0);
    await addMaterial(id, "Hapi 2.pdf", 1);
    // Downloads are off: a Word file can't be opened, so it doesn't count toward progress.
    await addMaterial(id, "Shënime.docx", 2, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

    expect((await listMaterials(student, id)).map((m) => m.seen)).toEqual([false, false, false]);
    await grantMaterialAccess(student, id, first.id, "view");
    await grantMaterialAccess(student, id, first.id, "view"); // opening again changes nothing
    expect((await listMaterials(student, id)).map((m) => m.seen)).toEqual([true, false, false]);
    expect((await listStudentLessons(student))[0].progress).toEqual({ seen: 1, total: 2 });

    // Admins opening a material don't count.
    await grantMaterialAccess(admin, id, first.id, "view");
    const progress = await getLessonProgress(id);
    expect(progress.total).toBe(2);
    expect(progress.students).toMatchObject([{ id: student.id, seen: 1 }]);
    expect(progress.students[0].lastSeenAt).toBeInstanceOf(Date);
  });
});
