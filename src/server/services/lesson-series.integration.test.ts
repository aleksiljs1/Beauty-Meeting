import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { academyDay, toZonedInputValue } from "@/lib/datetime";
import { createUser, resetDatabase } from "@/test/fixtures";

const { createRepeatingLesson } = await import("./lessons");
const { addSeriesStudents, deleteSeries, removeSeriesStudent, setSeriesPublication, updateSeries } = await import("./lesson-series");
const { getLessonSeries, listLessons } = await import("@/server/queries/admin");
const { prisma } = await import("@/server/db");

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

let admin: Awaited<ReturnType<typeof createUser>>;

beforeEach(async () => {
  await resetDatabase();
  admin = await createUser("admin");
});

/** Every day for a week from tomorrow 17:00-ish, with one student; the first date is then moved into the past. */
async function series(studentIds: string[] = []) {
  const start = new Date(Date.now() + DAY);
  const schedule = { scheduledStartAt: start, scheduledEndAt: new Date(start.getTime() + 2 * HOUR), joinOpensAt: new Date(start.getTime() - 15 * 60_000), accessExpiresAt: new Date(start.getTime() + 30 * DAY) };
  const created = await createRepeatingLesson({ title: "Grim bazë", ...schedule }, { weekdays: [0, 1, 2, 3, 4, 5, 6], until: academyDay(new Date(start.getTime() + 6 * DAY)) }, false, admin, studentIds);
  const lessons = await prisma.lesson.findMany({ where: { seriesId: created.seriesId! }, orderBy: { scheduledStartAt: "asc" } });
  // The first date already happened, so bulk changes must leave it alone.
  const past = new Date(Date.now() - 3 * HOUR);
  await prisma.lesson.update({ where: { id: lessons[0].id }, data: { scheduledStartAt: past, scheduledEndAt: new Date(past.getTime() + HOUR), joinOpensAt: past } });
  return { id: created.seriesId!, lessons };
}

const notices = (userId: string, type: "LESSON_CANCELLED" | "LESSON_RESCHEDULED") => prisma.notification.count({ where: { userId, type } });

describe("lesson series", () => {
  it("is one entry in the lessons list, with every date on its own page", async () => {
    const { id, lessons } = await series();
    const list = await listLessons({});
    expect(list.total).toBe(1);
    expect(list.items[0]).toMatchObject({ kind: "series", id, title: "Grim bazë" });
    expect(list.items[0].kind === "series" && list.items[0].lessons).toHaveLength(7);
    expect((await getLessonSeries(id))?.upcoming).toHaveLength(lessons.length - 1);
  });

  it("changes the upcoming dates together and tells each student once", async () => {
    const student = await createUser("student");
    const { id, lessons } = await series([student.id]);
    await setSeriesPublication(id, "PUBLISHED", admin);

    expect(await updateSeries(id, { title: "Grim i avancuar", time: { start: "09:30", durationMinutes: 90 } }, false, admin)).toMatchObject({ count: 6 });
    const after = await prisma.lesson.findMany({ where: { seriesId: id }, orderBy: { scheduledStartAt: "asc" } });
    expect(after[0]).toMatchObject({ title: "Grim bazë", publication: "DRAFT" }); // the past date: untouched
    for (const lesson of after.slice(1)) {
      expect(lesson.title).toBe("Grim i avancuar");
      expect(toZonedInputValue(lesson.scheduledStartAt).slice(11)).toBe("09:30");
      expect(lesson.scheduledEndAt.getTime() - lesson.scheduledStartAt.getTime()).toBe(90 * 60_000);
    }
    const day = (l: { scheduledStartAt: Date }) => academyDay(l.scheduledStartAt);
    expect(after.slice(1).map(day)).toEqual(lessons.slice(1).map(day)); // same days, new time
    expect(await notices(student.id, "LESSON_RESCHEDULED")).toBe(1);

    expect(await setSeriesPublication(id, "CANCELLED", admin)).toMatchObject({ count: 6 });
    expect(await prisma.lesson.count({ where: { seriesId: id, publication: "CANCELLED" } })).toBe(6);
    expect(await notices(student.id, "LESSON_CANCELLED")).toBe(1);
  });

  it("adds and removes a student on every upcoming date only", async () => {
    const [stays, leaves] = [await createUser("student"), await createUser("student")];
    const { id, lessons } = await series([leaves.id]);
    expect(await removeSeriesStudent(id, leaves.id, admin)).toEqual({ removed: 6 });
    expect(await prisma.lessonEnrollment.findFirst({ where: { lessonId: lessons[0].id, userId: leaves.id } })).toMatchObject({ revokedAt: null });

    expect(await addSeriesStudents(id, [stays.id, leaves.id], admin)).toEqual({ added: 12 }); // the removed one comes back too
    expect((await getLessonSeries(id))?.students.map((s) => s.lessons)).toEqual([6, 6]);
  });

  it("deletes the upcoming dates or the whole series", async () => {
    const { id, lessons } = await series();
    expect(await deleteSeries(id, admin, { upcomingOnly: true })).toEqual({ count: 6 });
    expect(await prisma.lesson.findMany({ where: { seriesId: id }, select: { id: true } })).toEqual([{ id: lessons[0].id }]);
    expect(await deleteSeries(id, admin)).toEqual({ count: 1 });
    expect(await prisma.lessonSeries.findUnique({ where: { id } })).toBeNull();
  });
});
