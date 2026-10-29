import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { createLesson as createFixtureLesson, createUser, resetDatabase } from "@/test/fixtures";

const { enrollStudents, listCourseCandidates, listCourseStudents, setStudentCourses } = await import("./course-members");
const { createLesson } = await import("./lessons");
const { revokeEnrollment } = await import("./enrollments");
const { deleteCourse } = await import("./content");
const { requireLessonCapability } = await import("@/server/access/lesson-access");
const { prisma } = await import("@/server/db");

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

let admin: Awaited<ReturnType<typeof createUser>>;

beforeEach(async () => {
  await resetDatabase();
  admin = await createUser("admin");
});

let courseCount = 0;
async function createCourse(title = "Ngjyrosja") {
  courseCount += 1;
  return prisma.course.create({ data: { title, slug: `kursi-${courseCount}-${Date.now()}` } });
}

function schedule(startOffset = DAY) {
  const start = new Date(Date.now() + startOffset);
  return {
    scheduledStartAt: start,
    scheduledEndAt: new Date(start.getTime() + 2 * HOUR),
    joinOpensAt: new Date(start.getTime() - 15 * 60_000),
    accessExpiresAt: new Date(start.getTime() + 30 * DAY),
  };
}

const enrollmentOf = (lessonId: string, userId: string) =>
  prisma.lessonEnrollment.findUnique({ where: { lessonId_userId: { lessonId, userId } }, select: { source: true, revokedAt: true } });

describe("course students", () => {
  it("lists only a course's active students for pre-selection", async () => {
    const course = await createCourse();
    const [ana, sara, other] = [await createUser("student"), await createUser("student"), await createUser("student")];
    const banned = await createUser("student", { banned: true });
    for (const s of [ana, sara, banned]) await setStudentCourses(s.id, [course.id], admin);

    const listed = await listCourseStudents(course.id);
    expect(listed.map((s) => s.id).sort()).toEqual([ana.id, sara.id].sort());
    expect(listed.some((s) => s.id === other.id)).toBe(false);
  });

  it("creates a lesson with the chosen students: course members as COURSE, outsiders as ADMIN", async () => {
    const course = await createCourse();
    const [member, outsider, skipped] = [await createUser("student"), await createUser("student"), await createUser("student")];
    await setStudentCourses(member.id, [course.id], admin);
    await setStudentCourses(skipped.id, [course.id], admin);

    const lesson = await createLesson({ title: "Mësim kursi", courseId: course.id, ...schedule() }, false, admin, [member.id, outsider.id]);
    expect(lesson.enrolled).toBe(2);
    expect(await enrollmentOf(lesson.id, member.id)).toMatchObject({ source: "COURSE", revokedAt: null });
    expect(await enrollmentOf(lesson.id, outsider.id)).toMatchObject({ source: "ADMIN" });
    expect(await enrollmentOf(lesson.id, skipped.id)).toBeNull(); // unticked in the form: not added

    // Access still comes only from the enrolment and the central policy (draft = not yet visible).
    await expect(requireLessonCapability(member, lesson.id, "VIEW_CARD")).rejects.toMatchObject({ code: "LESSON_NOT_AVAILABLE" });
    await prisma.lesson.update({ where: { id: lesson.id }, data: { publication: "PUBLISHED" } });
    await expect(requireLessonCapability(member, lesson.id, "VIEW_CONTENT")).resolves.toBeDefined();
  });

  it("rejects a deactivated student before the lesson is created (nothing half-made)", async () => {
    const banned = await createUser("student", { banned: true });
    await expect(createLesson({ title: "Mësim", ...schedule() }, false, admin, [banned.id])).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await prisma.lesson.count()).toBe(0);
  });

  it("adds a new course member to that course's upcoming lessons only, never re-granting a revoked one", async () => {
    const [course, otherCourse] = [await createCourse("Kursi A"), await createCourse("Kursi B")];
    const student = await createUser("student");
    const upcoming = await createFixtureLesson(admin.id, { courseId: course.id });
    const draft = await createFixtureLesson(admin.id, { courseId: course.id, publication: "DRAFT" });
    const past = await createFixtureLesson(admin.id, { courseId: course.id, ...schedule(-3 * DAY) });
    const cancelled = await createFixtureLesson(admin.id, { courseId: course.id, publication: "CANCELLED" });
    const elsewhere = await createFixtureLesson(admin.id, { courseId: otherCourse.id });
    const revokedEarlier = await createFixtureLesson(admin.id, { courseId: course.id });
    const old = await prisma.lessonEnrollment.create({ data: { lessonId: revokedEarlier.id, userId: student.id, source: "ADMIN" } });
    await revokeEnrollment(old.id, admin);

    const result = await setStudentCourses(student.id, [course.id], admin, { addToUpcoming: true });
    expect(result).toMatchObject({ added: 1, removed: 0, lessonsAdded: 2 });
    expect(await enrollmentOf(upcoming.id, student.id)).toMatchObject({ source: "COURSE", revokedAt: null });
    expect(await enrollmentOf(draft.id, student.id)).toMatchObject({ source: "COURSE" });
    for (const lesson of [past, cancelled, elsewhere]) expect(await enrollmentOf(lesson.id, student.id)).toBeNull();
    expect((await enrollmentOf(revokedEarlier.id, student.id))?.revokedAt).not.toBeNull();
  });

  it("without addToUpcoming, and when removed from a course, lesson access is left untouched", async () => {
    const course = await createCourse();
    const student = await createUser("student");
    const lesson = await createFixtureLesson(admin.id, { courseId: course.id });

    expect(await setStudentCourses(student.id, [course.id], admin)).toMatchObject({ added: 1, lessonsAdded: 0 });
    expect(await enrollmentOf(lesson.id, student.id)).toBeNull();

    await enrollStudents(lesson.id, [student.id], admin);
    expect(await setStudentCourses(student.id, [], admin)).toMatchObject({ removed: 1 });
    expect(await enrollmentOf(lesson.id, student.id)).toMatchObject({ revokedAt: null });
  });

  it("with removeFromUpcoming, leaving a course revokes its upcoming lessons only", async () => {
    const [course, other] = [await createCourse(), await createCourse()];
    const student = await createUser("student");
    const upcoming = await createFixtureLesson(admin.id, { courseId: course.id });
    const past = await createFixtureLesson(admin.id, { courseId: course.id, ...schedule(-3 * DAY) });
    const stays = await createFixtureLesson(admin.id, { courseId: other.id });
    await setStudentCourses(student.id, [course.id, other.id], admin);
    for (const lesson of [upcoming, past, stays]) await enrollStudents(lesson.id, [student.id], admin);

    expect(await setStudentCourses(student.id, [other.id], admin, { removeFromUpcoming: true })).toMatchObject({ removed: 1, lessonsRemoved: 1 });
    expect((await enrollmentOf(upcoming.id, student.id))?.revokedAt).not.toBeNull();
    for (const lesson of [past, stays]) expect(await enrollmentOf(lesson.id, student.id)).toMatchObject({ revokedAt: null });
  });

  it("roster candidates: members not yet in the lesson; revoked ones flagged and restored only on request", async () => {
    const course = await createCourse();
    const lesson = await createFixtureLesson(admin.id, { courseId: course.id });
    const [inLesson, waiting, revoked] = [await createUser("student"), await createUser("student"), await createUser("student")];
    const banned = await createUser("student", { banned: true });
    for (const s of [inLesson, waiting, revoked, banned]) await setStudentCourses(s.id, [course.id], admin);
    await enrollStudents(lesson.id, [inLesson.id, revoked.id], admin);
    const revokedRow = await prisma.lessonEnrollment.findUniqueOrThrow({ where: { lessonId_userId: { lessonId: lesson.id, userId: revoked.id } } });
    await revokeEnrollment(revokedRow.id, admin);

    const { candidates, memberCount, courseTitle } = await listCourseCandidates(lesson.id);
    expect(courseTitle).toBe(course.title);
    expect(memberCount).toBe(3);
    expect(candidates.map((c) => [c.id, c.revoked]).sort()).toEqual([[waiting.id, false], [revoked.id, true]].sort());

    // Adding again without restoreRevoked: the new student joins, the revoked one stays revoked.
    expect(await enrollStudents(lesson.id, [waiting.id, revoked.id, inLesson.id], admin)).toEqual({ added: 1, restored: 0 });
    expect((await enrollmentOf(lesson.id, revoked.id))?.revokedAt).not.toBeNull();
    expect(await enrollStudents(lesson.id, [revoked.id], admin, { restoreRevoked: true })).toEqual({ added: 0, restored: 1 });
    expect((await listCourseCandidates(lesson.id)).candidates).toHaveLength(0);
  });

  it("a lesson without a course has no course candidates", async () => {
    const lesson = await createFixtureLesson(admin.id);
    expect(await listCourseCandidates(lesson.id)).toEqual({ courseTitle: null, candidates: [], memberCount: 0 });
  });

  it("deleting a course removes memberships but keeps every lesson enrolment", async () => {
    const course = await createCourse();
    const student = await createUser("student");
    const lesson = await createFixtureLesson(admin.id, { courseId: course.id });
    await setStudentCourses(student.id, [course.id], admin, { addToUpcoming: true });

    await deleteCourse(admin, course.id);
    expect(await prisma.courseMember.count()).toBe(0);
    expect(await enrollmentOf(lesson.id, student.id)).toMatchObject({ source: "COURSE", revokedAt: null });
    expect((await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } })).courseId).toBeNull();
  });

  it("rejects unknown courses and non-student accounts", async () => {
    const student = await createUser("student");
    await expect(setStudentCourses(student.id, ["00000000-0000-7000-8000-000000000000"], admin)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(setStudentCourses(admin.id, [], admin)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const lesson = await createFixtureLesson(admin.id);
    await expect(enrollStudents(lesson.id, [admin.id], admin)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
