import "server-only";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { heldClasses } from "./participation";
import { listPaymentAccounts } from "./payments";

export type MyCourse = {
  id: string;
  title: string;
  /** The student's lessons of this course (published, not demos): how many are over, and in all. */
  lessonsDone: number;
  lessonsTotal: number;
  /** Held classes they could attend, and how many they came to. */
  attended: number;
  available: number;
  nextLesson: { id: string; title: string; scheduledStartAt: Date } | null;
  /** Billing, when the course has it: the last day paid for and the next payment's day. */
  paidUntil: string | null;
  nextDueOn: string | null;
  overdue: boolean;
  billed: boolean;
};

/** "Kurset e mia": the student's courses with their progress and what is paid, only their own. */
export async function getMyCourses(user: AppUser, now = new Date()): Promise<MyCourse[]> {
  const memberships = await prisma.courseMember.findMany({
    where: { userId: user.id },
    orderBy: { course: { position: "asc" } },
    select: { course: { select: { id: true, title: true } } },
  });
  if (!memberships.length) return [];
  const courseIds = memberships.map((m) => m.course.id);

  const [lessons, classes, { accounts }] = await Promise.all([
    prisma.lesson.findMany({
      where: { courseId: { in: courseIds }, isDemo: false, publication: "PUBLISHED", enrollments: { some: { userId: user.id, revokedAt: null } } },
      orderBy: { scheduledStartAt: "asc" },
      select: { id: true, title: true, courseId: true, scheduledStartAt: true, scheduledEndAt: true },
    }),
    heldClasses({ userIds: [user.id], lesson: { courseId: { in: courseIds } }, now }),
    listPaymentAccounts({ userId: user.id }, now),
  ]);

  return memberships.map(({ course }) => {
    const own = lessons.filter((l) => l.courseId === course.id);
    const held = classes.filter((c) => c.courseId === course.id);
    const account = accounts.find((a) => a.courseId === course.id && a.member);
    const next = own.find((l) => l.scheduledEndAt > now) ?? null;
    return {
      id: course.id,
      title: course.title,
      lessonsDone: own.filter((l) => l.scheduledEndAt <= now).length,
      lessonsTotal: own.length,
      attended: held.filter((c) => c.attended).length,
      available: held.length,
      nextLesson: next && { id: next.id, title: next.title, scheduledStartAt: next.scheduledStartAt },
      paidUntil: account?.paidUntil ?? null,
      nextDueOn: account?.nextDueOn ?? null,
      overdue: account?.status === "OVERDUE",
      billed: !!account,
    };
  });
}
