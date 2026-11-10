import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { createLesson, createUser, resetDatabase } from "@/test/fixtures";

const { submitFeedback, feedbackInputSchema } = await import("./feedback");
const { countPendingFeedback, getCourseFeedback, getOwnLessonFeedback, getStudentFeedback, listAppFeedback, listEndedCourseFeedback, listOtherLessonFeedback } =
  await import("@/server/queries/feedback");
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

let courseCount = 0;
const createCourse = (title = "Ngjyrosja") => prisma.course.create({ data: { title, slug: `kursi-${++courseCount}-${Date.now()}` } });

/** A lesson that started `hoursAgo` hours ago and lasted 2 hours (negative = in the future). */
function lessonAt(hoursAgo: number, overrides: Parameters<typeof createLesson>[1] = {}) {
  const start = new Date(Date.now() - hoursAgo * HOUR);
  return createLesson(admin.id, {
    scheduledStartAt: start,
    scheduledEndAt: new Date(start.getTime() + 2 * HOUR),
    joinOpensAt: new Date(start.getTime() - 15 * 60_000),
    accessExpiresAt: new Date(start.getTime() + 30 * DAY),
    ...overrides,
  });
}

const enroll = (lessonId: string, userId = student.id, revokedAt: Date | null = null) =>
  prisma.lessonEnrollment.create({ data: { lessonId, userId, source: "ADMIN", revokedAt } });

// Through the API's own input schema, as the route does.
const rateLesson = (lessonId: string, rating = 5, comment?: string) => submitFeedback(student, feedbackInputSchema.parse({ topic: "LESSON", lessonId, rating, comment }));

describe("lesson feedback", () => {
  it("is only possible for the student's own lessons that are over", async () => {
    const past = await lessonAt(5);
    const future = await lessonAt(-24);
    const notMine = await lessonAt(5);
    const cancelled = await lessonAt(5, { publication: "CANCELLED" });
    const revoked = await lessonAt(5);
    await Promise.all([enroll(past.id), enroll(future.id), enroll(cancelled.id), enroll(revoked.id, student.id, new Date())]);

    await expect(rateLesson(past.id)).resolves.toBeTruthy();
    for (const lesson of [future, notMine, cancelled, revoked]) await expect(rateLesson(lesson.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("opens as soon as the class is ended, even before its scheduled end", async () => {
    const lesson = await lessonAt(1, { meetingStatus: "ENDED" });
    await enroll(lesson.id);
    await expect(rateLesson(lesson.id, 4)).resolves.toBeTruthy();
  });

  it("keeps one rating per student and lesson: sending again changes it", async () => {
    const lesson = await lessonAt(5);
    await enroll(lesson.id);
    await rateLesson(lesson.id, 2, "Zëri nuk dëgjohej mirë");
    await rateLesson(lesson.id, 4, "  ");

    const rows = await prisma.feedback.findMany({ where: { lessonId: lesson.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rating: 4, comment: null, topic: "LESSON" });
    expect(await getOwnLessonFeedback(student, lesson.id)).toEqual({ rating: 4, comment: null });
  });

  it("is offered on the lesson page only once the lesson can be rated", async () => {
    const future = await lessonAt(-24);
    await enroll(future.id);
    expect(await getOwnLessonFeedback(student, future.id)).toBeUndefined();
  });
});

describe("course feedback", () => {
  it("opens when the course's last lesson is over, for students who took part", async () => {
    const course = await createCourse();
    const first = await lessonAt(48, { courseId: course.id });
    const last = await lessonAt(-24, { courseId: course.id });
    await Promise.all([enroll(first.id), enroll(last.id)]);
    const outsider = await createUser("student");

    const rate = (user = student) => submitFeedback(user, { topic: "COURSE", courseId: course.id, rating: 5, comment: null });
    await expect(rate()).rejects.toMatchObject({ code: "CONFLICT" });

    await prisma.lesson.update({ where: { id: last.id }, data: { scheduledStartAt: new Date(Date.now() - 5 * HOUR), scheduledEndAt: new Date(Date.now() - 3 * HOUR) } });
    await expect(rate()).resolves.toBeTruthy();
    await expect(rate(outsider)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("app feedback", () => {
  it("can be sent several times, up to a daily limit", async () => {
    for (let i = 0; i < 10; i++) await submitFeedback(student, { topic: "APP", rating: 4, comment: `Mesazhi ${i}` });
    await expect(submitFeedback(student, { topic: "APP", rating: 4, comment: "Edhe një" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(await listAppFeedback()).toHaveLength(10);
  });

  it("rejects ratings outside 1-5 and mismatched targets", () => {
    expect(feedbackInputSchema.safeParse({ topic: "APP", rating: 0 }).success).toBe(false);
    expect(feedbackInputSchema.safeParse({ topic: "APP", rating: 6 }).success).toBe(false);
    expect(feedbackInputSchema.safeParse({ topic: "LESSON", rating: 3 }).success).toBe(false);
  });

  it("is refused for admins", async () => {
    await expect(submitFeedback(admin, { topic: "APP", rating: 5, comment: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("student and admin views", () => {
  it("shows unrated recent lessons as pending and sorts rated lessons by course state for the admin", async () => {
    const ended = await createCourse("Kursi i mbaruar");
    const running = await createCourse("Kursi në vazhdim");
    const endedLesson = await lessonAt(30, { courseId: ended.id, title: "Mësimi i fundit" });
    const runningLesson = await lessonAt(30, { courseId: running.id, title: "Mësimi i parë" });
    await lessonAt(-48, { courseId: running.id });
    const loose = await lessonAt(10, { title: "Mësim pa kurs" });
    await Promise.all([enroll(endedLesson.id), enroll(runningLesson.id), enroll(loose.id)]);

    expect(await countPendingFeedback(student)).toBe(4); // three lessons + the ended course
    await rateLesson(endedLesson.id, 5, "Shumë e qartë");
    await rateLesson(runningLesson.id, 3);
    await rateLesson(loose.id, 4);
    await submitFeedback(student, { topic: "COURSE", courseId: ended.id, rating: 4, comment: null });
    expect(await countPendingFeedback(student)).toBe(0);

    const mine = await getStudentFeedback(student);
    expect(mine.courses.map((c) => c.title)).toEqual(["Kursi i mbaruar"]);
    expect(mine.lessons).toHaveLength(3);

    const courses = await listEndedCourseFeedback();
    expect(courses).toHaveLength(1);
    expect(courses[0]).toMatchObject({ title: "Kursi i mbaruar", course: { average: 4, count: 1 }, lessons: { average: 5, count: 1 } });

    const detail = await getCourseFeedback(ended.id);
    expect(detail?.lessons[0].entries[0]).toMatchObject({ rating: 5, comment: "Shumë e qartë", studentName: student.name });

    const others = await listOtherLessonFeedback();
    expect(others.map((l) => l.title).sort()).toEqual(["Mësim pa kurs", "Mësimi i parë"]);
  });

  it("refuses a row whose target does not match its topic (database check)", async () => {
    const lesson = await lessonAt(5);
    await expect(prisma.feedback.create({ data: { userId: student.id, topic: "APP", lessonId: lesson.id, rating: 3 } })).rejects.toThrow();
    await expect(prisma.feedback.create({ data: { userId: student.id, topic: "LESSON", rating: 3 } })).rejects.toThrow();
  });
});
