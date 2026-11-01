import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { createLesson, createUser, resetDatabase } from "@/test/fixtures";

const { listStudentLessons } = await import("./portal");
const { prisma } = await import("@/server/db");

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** A published lesson starting `offsetMs` from now, two hours long, with access for a month after. */
const lessonAt = (adminId: string, title: string, offsetMs: number, extra: { meetingStatus?: "LIVE" } = {}) => {
  const start = new Date(Date.now() + offsetMs);
  return createLesson(adminId, {
    title,
    scheduledStartAt: start,
    scheduledEndAt: new Date(start.getTime() + 2 * HOUR),
    joinOpensAt: new Date(start.getTime() - 15 * 60_000),
    accessExpiresAt: new Date(start.getTime() + 30 * DAY),
    ...extra,
  });
};

beforeEach(resetDatabase);

describe("the student's lesson list", () => {
  it("shows the live class first, then upcoming soonest first, then past lessons newest first", async () => {
    const admin = await createUser("admin");
    const student = await createUser("student");
    const lessons = [
      await lessonAt(admin.id, "E kaluar herët", -10 * DAY),
      await lessonAt(admin.id, "E nesërme", DAY),
      await lessonAt(admin.id, "E kaluar dje", -DAY),
      await lessonAt(admin.id, "Live tani", -HOUR, { meetingStatus: "LIVE" }),
      await lessonAt(admin.id, "Pas një jave", 7 * DAY),
    ];
    await prisma.lessonEnrollment.createMany({ data: lessons.map((l) => ({ lessonId: l.id, userId: student.id, source: "ADMIN" as const })) });

    const titles = (await listStudentLessons(student)).map((card) => card.title);
    expect(titles).toEqual(["Live tani", "E nesërme", "Pas një jave", "E kaluar dje", "E kaluar herët"]);
  });
});
