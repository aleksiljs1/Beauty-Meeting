import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { createLesson as createFixtureLesson, createUser, resetDatabase } from "@/test/fixtures";

const { createLesson, createRepeatingLesson, updateLesson, setLessonPublication, runDemoAction, deleteDraftLesson } = await import("./lessons");
const { grantEnrollment, revokeEnrollment, restoreEnrollment, setEnrollmentDeadline } = await import("./enrollments");
const { setStudentActive } = await import("./students");
const { requireLessonCapability } = await import("@/server/access/lesson-access");
const { prisma } = await import("@/server/db");

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

let admin: Awaited<ReturnType<typeof createUser>>;

beforeEach(async () => {
  await resetDatabase();
  admin = await createUser("admin");
});

function schedule(startOffset = DAY) {
  const start = new Date(Date.now() + startOffset);
  return {
    scheduledStartAt: start,
    scheduledEndAt: new Date(start.getTime() + 2 * HOUR),
    joinOpensAt: new Date(start.getTime() - 15 * 60_000),
    accessExpiresAt: new Date(start.getTime() + 30 * DAY),
  };
}

describe("lesson administration", () => {
  it("creates drafts, requires confirmation for an early deadline and audits", async () => {
    const s = schedule();
    const { id } = await createLesson({ title: "Mësim prove", ...s }, false, admin);
    const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id } });
    expect(lesson.publication).toBe("DRAFT");
    expect(lesson.meetingStatus).toBe("NOT_PROVISIONED");

    const early = new Date(s.scheduledStartAt.getTime() + HOUR);
    const attempt = updateLesson(id, { accessExpiresAt: early }, false, admin);
    await expect(attempt).rejects.toBeInstanceOf(ZodError);
    await attempt.catch((error: ZodError) => expect(error.issues[0].path).toEqual(["confirmEarlyDeadline"]));

    await updateLesson(id, { accessExpiresAt: early }, true, admin);
    expect((await prisma.lesson.findUniqueOrThrow({ where: { id } })).accessExpiresAt).toEqual(early);
    expect(await prisma.auditLog.count({ where: { targetId: id, action: { in: ["lesson.create", "lesson.update"] } } })).toBe(2);
  });

  it("rejects an end before the start and join opening after the start", async () => {
    const s = schedule();
    await expect(createLesson({ title: "X y", ...s, scheduledEndAt: s.scheduledStartAt }, true, admin)).rejects.toBeInstanceOf(ZodError);
    await expect(createLesson({ title: "X y", ...s, joinOpensAt: new Date(s.scheduledStartAt.getTime() + 1) }, true, admin)).rejects.toBeInstanceOf(ZodError);
  });

  it("follows publication transitions and only deletes empty drafts", async () => {
    const { id } = await createLesson({ title: "Mësim prove", ...schedule() }, false, admin);
    await setLessonPublication(id, "PUBLISHED", admin);
    await expect(deleteDraftLesson(id, admin)).rejects.toThrow();
    await setLessonPublication(id, "CANCELLED", admin);
    await expect(setLessonPublication(id, "PUBLISHED", admin)).rejects.toThrow();
    await setLessonPublication(id, "DRAFT", admin);
    await deleteDraftLesson(id, admin);
    expect(await prisma.lesson.findUnique({ where: { id } })).toBeNull();
  });

  it("runs the demo classroom only for demo lessons", async () => {
    const demo = await createLesson({ title: "Demo", ...schedule(), isDemo: true }, false, admin);
    const real = await createFixtureLesson(admin.id);
    await expect(runDemoAction(real.id, "live", admin)).rejects.toThrow();
    await setLessonPublication(demo.id, "PUBLISHED", admin);
    await runDemoAction(demo.id, "live", admin);
    expect((await prisma.lesson.findUniqueOrThrow({ where: { id: demo.id } })).meetingStatus).toBe("LIVE");
    await runDemoAction(demo.id, "end", admin);
    await runDemoAction(demo.id, "reset", admin);
    expect((await prisma.lesson.findUniqueOrThrow({ where: { id: demo.id } })).meetingStatus).toBe("SCHEDULED");
  });
});

describe("repeating lessons", () => {
  it("creates one draft per date, each with the chosen students", async () => {
    const student = await createUser("student");
    const first = new Date("2030-01-07T16:00:00Z"); // Monday 17:00 Tirana
    const s = { ...schedule(), scheduledStartAt: first, scheduledEndAt: new Date(first.getTime() + 2 * HOUR), joinOpensAt: new Date(first.getTime() - 15 * 60_000), accessExpiresAt: new Date(first.getTime() + 30 * DAY) };
    const result = await createRepeatingLesson({ title: "Grim", ...s }, { weekdays: [0, 2], until: "2030-01-16" }, false, admin, [student.id]);

    expect(result.count).toBe(4); // Mon 7, Wed 9, Mon 14, Wed 16
    const lessons = await prisma.lesson.findMany({ orderBy: { scheduledStartAt: "asc" }, include: { enrollments: true } });
    expect(lessons.map((l) => l.scheduledStartAt.toISOString().slice(0, 10))).toEqual(["2030-01-07", "2030-01-09", "2030-01-14", "2030-01-16"]);
    expect(lessons.every((l) => l.publication === "DRAFT" && l.title === "Grim" && l.enrollments[0]?.userId === student.id)).toBe(true);
  });

  it("refuses too many lessons before creating any", async () => {
    await expect(createRepeatingLesson({ title: "Grim", ...schedule() }, { weekdays: [0, 1, 2, 3, 4, 5, 6], until: "2099-01-01" }, false, admin)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(await prisma.lesson.count()).toBe(0);
  });
});

describe("enrolment administration", () => {
  it("grants, revokes, re-grants and shortens access through the central policy", async () => {
    const student = await createUser("student");
    const lesson = await createFixtureLesson(admin.id);
    const { id } = await grantEnrollment(lesson.id, student.id, admin);
    await expect(grantEnrollment(lesson.id, student.id, admin)).rejects.toThrow();
    await expect(requireLessonCapability(student, lesson.id, "VIEW_CONTENT")).resolves.toBeTruthy();

    await revokeEnrollment(id, admin);
    await expect(requireLessonCapability(student, lesson.id, "VIEW_CONTENT")).rejects.toThrow();
    await restoreEnrollment(id, admin);
    await expect(requireLessonCapability(student, lesson.id, "VIEW_CONTENT")).resolves.toBeTruthy();

    await expect(setEnrollmentDeadline(id, new Date(lesson.accessExpiresAt.getTime() + DAY), admin)).rejects.toThrow();
    await setEnrollmentDeadline(id, new Date(Date.now() - 1000), admin);
    await expect(requireLessonCapability(student, lesson.id, "VIEW_CONTENT")).rejects.toThrow();
    await setEnrollmentDeadline(id, null, admin);
    await expect(requireLessonCapability(student, lesson.id, "VIEW_CONTENT")).resolves.toBeTruthy();

    const actions = (await prisma.auditLog.findMany({ where: { targetId: lesson.id }, select: { action: true } })).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining(["enrollment.grant", "enrollment.revoke", "enrollment.regrant", "enrollment.deadline_set", "enrollment.deadline_clear"]),
    );
  });

  it("deactivation bans the student and deletes their sessions", async () => {
    const student = await createUser("student");
    await prisma.session.create({ data: { id: "s1", token: "t1", userId: student.id, expiresAt: new Date(Date.now() + DAY) } });
    await setStudentActive(student.id, false, admin);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: student.id } })).banned).toBe(true);
    expect(await prisma.session.count({ where: { userId: student.id } })).toBe(0);
    await setStudentActive(student.id, true, admin);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: student.id } })).banned).toBe(false);
  });
});
