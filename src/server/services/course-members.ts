import "server-only";
import { fromDbDate, joiningMonth } from "@/lib/billing";
import { todayInAcademy } from "@/lib/datetime";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/http";
import { publishFeedChanged } from "@/server/realtime/publish";
import { audit } from "./audit";

/**
 * Course membership ("which course a student attends") and adding a course's students to its
 * lessons in one step.
 *
 * Membership never grants access by itself — access is always a LessonEnrollment, decided by
 * the central policy. Membership only decides who is offered/pre-selected:
 *  - creating a lesson in a course pre-selects the course's active students;
 *  - a lesson's roster lists course students that aren't enrolled yet, to add with one click;
 *  - adding a student to a course can also enrol them in that course's upcoming lessons.
 * Nothing happens behind the admin's back: removing someone from a course, changing a lesson's
 * course or revoking a student from one lesson never changes other enrolments automatically,
 * and a student whose access to a lesson was revoked is never re-added unless explicitly chosen.
 */

const MAX_BATCH = 500;

/** Lessons a new course member can still take part in: not cancelled/archived, not over. */
function upcomingLessonsWhere(courseIds: string[], now: Date) {
  return { courseId: { in: courseIds }, publication: { in: ["DRAFT" as const, "PUBLISHED" as const] }, scheduledEndAt: { gt: now } };
}

export async function assertCoursesExist(courseIds: string[]) {
  if (!courseIds.length) return;
  const found = await prisma.course.count({ where: { id: { in: courseIds } } });
  if (found !== courseIds.length) throw new ApiError("VALIDATION_FAILED", "Kursi nuk u gjet.");
}

/** Active (not deactivated) student accounts among `userIds`; anything else is rejected. */
export async function assertActiveStudents(userIds: string[]) {
  if (userIds.length > MAX_BATCH) throw new ApiError("VALIDATION_FAILED", "Shumë studentë njëherësh.");
  if (!userIds.length) return;
  const found = await prisma.user.count({ where: { id: { in: userIds }, role: "student", banned: { not: true } } });
  if (found !== userIds.length) throw new ApiError("CONFLICT", "Një ose më shumë studentë nuk u gjetën ose janë çaktivizuar.");
}

/**
 * Enrols the chosen students in a lesson. New enrolments are marked COURSE when the student is
 * a member of the lesson's course, ADMIN otherwise. Already active enrolments are left alone;
 * revoked ones are restored only when `restoreRevoked` (an explicit choice in the roster).
 */
export async function enrollStudents(lessonId: string, userIds: string[], admin: AppUser, { restoreRevoked = false } = {}) {
  const ids = [...new Set(userIds)];
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { courseId: true } });
  if (!lesson) throw new ApiError("NOT_FOUND", "Mësimi nuk u gjet.");
  await assertActiveStudents(ids);
  if (!ids.length) return { added: 0, restored: 0 };

  const [existing, members] = await Promise.all([
    prisma.lessonEnrollment.findMany({ where: { lessonId, userId: { in: ids } }, select: { id: true, userId: true, revokedAt: true } }),
    lesson.courseId
      ? prisma.courseMember.findMany({ where: { courseId: lesson.courseId, userId: { in: ids } }, select: { userId: true } })
      : Promise.resolve([]),
  ]);
  const known = new Map(existing.map((e) => [e.userId, e]));
  const memberIds = new Set(members.map((m) => m.userId));
  const toCreate = ids.filter((id) => !known.has(id));
  const toRestore = restoreRevoked ? existing.filter((e) => e.revokedAt) : [];

  await prisma.$transaction([
    prisma.lessonEnrollment.createMany({
      data: toCreate.map((userId) => ({ lessonId, userId, source: memberIds.has(userId) ? ("COURSE" as const) : ("ADMIN" as const), grantedById: admin.id })),
      skipDuplicates: true, // a concurrent add of the same student is not an error
    }),
    prisma.lessonEnrollment.updateMany({
      where: { id: { in: toRestore.map((e) => e.id) }, revokedAt: { not: null } },
      data: { revokedAt: null, grantedById: admin.id },
    }),
  ]);

  for (const userId of toCreate) await audit(admin.id, "enrollment.grant", "lesson", lessonId, { userId, via: memberIds.has(userId) ? "course" : "admin" });
  for (const e of toRestore) await audit(admin.id, "enrollment.regrant", "lesson", lessonId, { enrollmentId: e.id, userId: e.userId });
  await publishFeedChanged([...toCreate, ...toRestore.map((e) => e.userId)]);
  return { added: toCreate.length, restored: toRestore.length };
}

/**
 * Replaces a student's courses. With `addToUpcoming`, the student is also enrolled in the
 * upcoming lessons of the courses they were just added to (never re-granting a revoked lesson).
 */
export async function setStudentCourses(userId: string, courseIds: string[], admin: AppUser, { addToUpcoming = false, now = new Date() } = {}) {
  const wanted = [...new Set(courseIds)];
  const student = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, banned: true } });
  if (!student || student.role !== "student") throw new ApiError("NOT_FOUND", "Studenti nuk u gjet.");
  await assertCoursesExist(wanted);

  const current = await prisma.courseMember.findMany({ where: { userId }, select: { courseId: true } });
  const currentIds = new Set(current.map((m) => m.courseId));
  const added = wanted.filter((id) => !currentIds.has(id));
  const removed = [...currentIds].filter((id) => !wanted.includes(id));

  // Someone joining a course that already started pays from the current course month.
  const billing = await prisma.course.findMany({ where: { id: { in: added } }, select: { id: true, startsOn: true, durationMonths: true } });
  const today = todayInAcademy(now);
  const firstMonth = (courseId: string) => {
    const course = billing.find((c) => c.id === courseId);
    return course?.startsOn && course.durationMonths
      ? joiningMonth({ startsOn: fromDbDate(course.startsOn), durationMonths: course.durationMonths }, today)
      : 1;
  };

  await prisma.$transaction([
    prisma.courseMember.deleteMany({ where: { userId, courseId: { in: removed } } }),
    prisma.courseMember.createMany({ data: added.map((courseId) => ({ courseId, userId, firstMonth: firstMonth(courseId) })), skipDuplicates: true }),
  ]);
  for (const courseId of added) await audit(admin.id, "course.member_add", "course", courseId, { userId });
  for (const courseId of removed) await audit(admin.id, "course.member_remove", "course", courseId, { userId });

  let lessonsAdded = 0;
  if (addToUpcoming && added.length && !student.banned) {
    const lessons = await prisma.lesson.findMany({
      where: { ...upcomingLessonsWhere(added, now), enrollments: { none: { userId } } },
      select: { id: true },
    });
    for (const lesson of lessons) lessonsAdded += (await enrollStudents(lesson.id, [userId], admin)).added;
  }
  return { added: added.length, removed: removed.length, lessonsAdded };
}

/** Active students of a course, for pre-selecting them in a new lesson. */
export async function listCourseStudents(courseId: string) {
  const rows = await prisma.courseMember.findMany({
    where: { courseId, user: { role: "student", banned: { not: true } } },
    orderBy: { user: { name: "asc" } },
    take: MAX_BATCH,
    select: { user: { select: { id: true, name: true, email: true } } },
  });
  return rows.map((r) => r.user);
}

export type CourseCandidate = { id: string; name: string; email: string; revoked: boolean };

/** The lesson course's active students who don't have active access to this lesson yet. */
export async function listCourseCandidates(lessonId: string): Promise<{ courseTitle: string | null; candidates: CourseCandidate[]; memberCount: number }> {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { course: { select: { id: true, title: true } } } });
  if (!lesson) throw new ApiError("NOT_FOUND", "Mësimi nuk u gjet.");
  if (!lesson.course) return { courseTitle: null, candidates: [], memberCount: 0 };

  const members = await prisma.courseMember.findMany({
    where: { courseId: lesson.course.id, user: { role: "student", banned: { not: true } } },
    orderBy: { user: { name: "asc" } },
    take: MAX_BATCH,
    select: { user: { select: { id: true, name: true, email: true, enrollments: { where: { lessonId }, select: { revokedAt: true }, take: 1 } } } },
  });
  const candidates = members
    .filter((m) => !m.user.enrollments[0] || m.user.enrollments[0].revokedAt)
    .map(({ user }) => ({ id: user.id, name: user.name, email: user.email, revoked: !!user.enrollments[0] }));
  return { courseTitle: lesson.course.title, candidates, memberCount: members.length };
}
