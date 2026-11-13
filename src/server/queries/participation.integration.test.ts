import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { createLesson, createUser, resetDatabase } from "@/test/fixtures";

const { getStudentParticipation, participationByStudent } = await import("./participation");
const { getAcademyStats } = await import("./stats");
const { prisma } = await import("@/server/db");

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
let adminId: string;

beforeEach(async () => {
  await resetDatabase();
  adminId = (await createUser("admin")).id;
});

/** A class that started `daysAgo` days ago and lasted 2 hours; `held` = Zoom said it started. */
async function classAt(daysAgo: number, { held = true, ...overrides }: { held?: boolean } & Parameters<typeof createLesson>[1] = {}) {
  const start = new Date(Date.now() - daysAgo * DAY);
  const end = new Date(start.getTime() + 2 * HOUR);
  return createLesson(adminId, {
    title: `Klasa ${daysAgo}`,
    scheduledStartAt: start,
    scheduledEndAt: end,
    joinOpensAt: new Date(start.getTime() - 15 * 60_000),
    accessExpiresAt: new Date(end.getTime() + 30 * DAY),
    ...(held ? { meetingStatus: "ENDED" as const, liveStartedAt: start, liveEndedAt: end } : {}),
    ...overrides,
  });
}

const enroll = (lessonId: string, userId: string, extra: { createdAt?: Date; revokedAt?: Date } = {}) =>
  prisma.lessonEnrollment.create({ data: { lessonId, userId, source: "ADMIN", ...extra } });

async function attend(lessonId: string, userId: string, minutes: number) {
  const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } });
  await prisma.lessonAttendance.create({
    data: { lessonId, userId, participantKey: `p-${userId}`, displayName: "Studenti", joinedAt: lesson.scheduledStartAt, leftAt: new Date(lesson.scheduledStartAt.getTime() + minutes * 60_000) },
  });
}

describe("participation", () => {
  it("counts only classes that took place while the student was enrolled, and which they came to", async () => {
    const student = await createUser("student");
    const came = await classAt(10);
    const missed = await classAt(5);
    const noShow = await classAt(3, { held: false }); // the class never started
    const cancelled = await classAt(4, { publication: "CANCELLED" });
    const demo = await classAt(6, { isDemo: true });
    const addedLater = await classAt(8); // added afterwards, for the recording
    const removed = await classAt(7);
    const upcoming = await classAt(-2, { held: false });
    for (const l of [came, missed, noShow, cancelled, demo, upcoming]) await enroll(l.id, student.id, { createdAt: new Date(l.scheduledStartAt.getTime() - DAY) });
    await enroll(addedLater.id, student.id, { createdAt: new Date() });
    await enroll(removed.id, student.id, { createdAt: new Date(removed.scheduledStartAt.getTime() - DAY), revokedAt: new Date() });
    await attend(came.id, student.id, 85);

    expect((await participationByStudent([student.id])).get(student.id)).toEqual({ available: 2, attended: 1 });

    const page = await getStudentParticipation(student.id);
    expect(page?.classes.map((c) => [c.title, c.attended, c.minutes])).toEqual([
      [missed.title, false, 0],
      [came.title, true, 85],
    ]);
    expect(page?.upcoming.map((l) => l.id)).toEqual([upcoming.id]);
  });

  it("is not available for other users", async () => {
    expect(await getStudentParticipation(adminId)).toBeNull();
  });
});

describe("academy stats", () => {
  it("adds up this month's payments, attendance and students who keep missing class", async () => {
    const course = await prisma.course.create({ data: { title: "Grim profesional", slug: `grim-${Date.now()}` } });
    const [regular, absent] = [await createUser("student"), await createUser("student")];
    for (const daysAgo of [9, 6, 3]) {
      const lesson = await classAt(daysAgo, { courseId: course.id });
      for (const s of [regular, absent]) await enroll(lesson.id, s.id, { createdAt: new Date(lesson.scheduledStartAt.getTime() - DAY) });
      await attend(lesson.id, regular.id, 100);
      if (daysAgo === 9) await attend(lesson.id, absent.id, 30); // came once, then stopped
    }
    const today = new Date().toISOString().slice(0, 10);
    await prisma.payment.createMany({
      data: [
        { courseId: course.id, userId: regular.id, months: 1, amountCents: 5000, paidOn: new Date(`${today}T00:00:00Z`) },
        { courseId: course.id, userId: absent.id, months: 1, amountCents: 4000, paidOn: new Date(`${today}T00:00:00Z`), cancelledAt: new Date() },
      ],
    });

    const stats = await getAcademyStats();
    expect(stats.collectedThisMonth).toBe(5000); // the cancelled payment doesn't count
    expect(stats.monthly).toHaveLength(12);
    expect(stats.attendance).toBe(67); // 4 of 6
    expect(stats.atRisk.map((s) => [s.id, s.missedInRow])).toEqual([[absent.id, 2]]);
    expect(stats.byCourse[0]).toMatchObject({ title: "Grim profesional", attendance: 67, incomeCents: 5000 });
  });
});
