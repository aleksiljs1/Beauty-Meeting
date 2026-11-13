import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { createLesson, createUser, resetDatabase } from "@/test/fixtures";

const { getMyCourses } = await import("./my-courses");
const { recordPayment } = await import("@/server/services/payments");
const { setStudentCourses } = await import("@/server/services/course-members");
const { prisma } = await import("@/server/db");

const DAY = 86_400_000;
let admin: Awaited<ReturnType<typeof createUser>>;

beforeEach(async () => {
  await resetDatabase();
  admin = await createUser("admin");
});

describe("Kurset e mia", () => {
  it("shows the student's own progress, next lesson and what is paid", async () => {
    const course = await prisma.course.create({
      data: { title: "Grim", slug: `grim-${Date.now()}`, startsOn: new Date("2026-01-01T00:00:00Z"), durationMonths: 24, monthlyPriceCents: 4000 },
    });
    const [student, other] = [await createUser("student"), await createUser("student")];
    for (const s of [student, other]) await setStudentCourses(s.id, [course.id], admin, { now: new Date("2026-01-02T10:00:00Z") });
    await recordPayment({ courseId: course.id, userId: student.id, months: 2, amountCents: 8000, paidOn: "2026-01-03", method: "CASH" }, admin, new Date("2026-01-04T10:00:00Z"));

    const start = (days: number) => new Date(Date.now() + days * DAY);
    const past = await createLesson(admin.id, { title: "E kaluar", courseId: course.id, publication: "PUBLISHED", scheduledStartAt: start(-3), scheduledEndAt: start(-2.9), liveStartedAt: start(-3), meetingStatus: "ENDED" });
    const next = await createLesson(admin.id, { title: "E radhës", courseId: course.id, publication: "PUBLISHED", scheduledStartAt: start(2), scheduledEndAt: start(2.1) });
    for (const l of [past, next]) await prisma.lessonEnrollment.create({ data: { lessonId: l.id, userId: student.id, source: "ADMIN", createdAt: start(-5) } });

    const [mine] = await getMyCourses(student);
    expect(mine).toMatchObject({ title: "Grim", lessonsDone: 1, lessonsTotal: 2, attended: 0, available: 1, paidUntil: "2026-02-28", overdue: true, billed: true });
    expect(mine.nextLesson?.id).toBe(next.id);
    expect((await getMyCourses(other))[0]).toMatchObject({ lessonsTotal: 0, paidUntil: null });
  });
});
