import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { summarizeStays, type Stay } from "@/lib/attendance";
import { END_GRACE_MS } from "@/server/access/policy";
import { prisma } from "@/server/db";

/**
 * Participation: of the classes a student could attend, which ones they came to.
 *
 * A class counts once it really took place (Zoom said it started) and is over; demos, drafts and
 * cancelled lessons never count. It counts for a student enrolled in it (not removed) before it
 * ended — being added afterwards, e.g. for the recording, isn't a missed class. "Came" means Zoom
 * saw them in the class (matched by our id or their name).
 */

/**
 * The one rule for "this class was held and is over", shared by participation, statistics and
 * which lessons a student may rate: it started (not a demo), and it ended, or is past its end
 * (a lost "ended" event; one still shown live counts once its grace is over).
 */
export const heldLessonWhere = (now: Date): Prisma.LessonWhereInput => ({
  isDemo: false,
  publication: { in: ["PUBLISHED", "ARCHIVED"] },
  liveStartedAt: { not: null },
  OR: [
    { meetingStatus: "ENDED" },
    { meetingStatus: { not: "LIVE" }, scheduledEndAt: { lte: now } },
    { scheduledEndAt: { lte: new Date(now.getTime() - END_GRACE_MS) } },
  ],
});

export type HeldClass = {
  userId: string;
  lessonId: string;
  title: string;
  courseId: string | null;
  courseTitle: string | null;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  attended: boolean;
  minutes: number;
};

/**
 * Every held class each of these students (all students when `userIds` is undefined) could
 * attend, with whether they came. `lesson` narrows the lessons (a course, a period).
 */
export async function heldClasses({ userIds, lesson = {}, now = new Date() }: { userIds?: string[]; lesson?: Prisma.LessonWhereInput; now?: Date }): Promise<HeldClass[]> {
  const enrollments = await prisma.lessonEnrollment.findMany({
    where: {
      ...(userIds ? { userId: { in: userIds } } : {}),
      revokedAt: null,
      user: { role: "student" },
      lesson: { AND: [heldLessonWhere(now), lesson] },
    },
    select: {
      userId: true,
      createdAt: true,
      lesson: {
        select: {
          id: true,
          title: true,
          scheduledStartAt: true,
          scheduledEndAt: true,
          meetingStatus: true,
          liveEndedAt: true,
          courseId: true,
          course: { select: { title: true } },
        },
      },
    },
  });
  const counted = enrollments.filter((e) => e.createdAt <= e.lesson.scheduledEndAt);
  if (!counted.length) return [];

  const visits = await prisma.lessonAttendance.findMany({
    where: { lessonId: { in: [...new Set(counted.map((e) => e.lesson.id))] }, userId: { in: [...new Set(counted.map((e) => e.userId))] } },
    select: { lessonId: true, userId: true, joinedAt: true, leftAt: true },
  });
  const staysOf = new Map<string, Stay[]>();
  for (const v of visits) {
    const key = `${v.userId}:${v.lessonId}`;
    staysOf.set(key, [...(staysOf.get(key) ?? []), v]);
  }

  return counted.map((e) => {
    // As on the lesson's attendance tab: overlapping devices count once, and a stay whose
    // "left" event never came ends with the class (still running: now).
    const classEnd = e.lesson.meetingStatus === "LIVE" ? now : (e.lesson.liveEndedAt ?? e.lesson.scheduledEndAt);
    const stays = staysOf.get(`${e.userId}:${e.lesson.id}`);
    const spent = stays && summarizeStays(stays, classEnd)?.minutes;
    return {
      userId: e.userId,
      lessonId: e.lesson.id,
      title: e.lesson.title,
      courseId: e.lesson.courseId,
      courseTitle: e.lesson.course?.title ?? null,
      scheduledStartAt: e.lesson.scheduledStartAt,
      scheduledEndAt: e.lesson.scheduledEndAt,
      attended: stays !== undefined,
      minutes: spent ?? 0,
    };
  });
}

export type Participation = { available: number; attended: number };

export function summarizeParticipation(classes: HeldClass[]): Participation {
  return { available: classes.length, attended: classes.filter((c) => c.attended).length };
}

/** "18 of 24" per student, for the students list. */
export async function participationByStudent(userIds: string[], now = new Date()): Promise<Map<string, Participation>> {
  const byStudent = new Map<string, Participation>(userIds.map((id) => [id, { available: 0, attended: 0 }]));
  for (const c of await heldClasses({ userIds, now })) {
    const p = byStudent.get(c.userId)!;
    p.available += 1;
    if (c.attended) p.attended += 1;
  }
  return byStudent;
}

/** One student's page: who they are, every class they could attend (newest first) and what's coming. */
export async function getStudentParticipation(userId: string, now = new Date()) {
  const student = await prisma.user.findFirst({
    where: { id: userId, role: "student" },
    select: {
      id: true,
      name: true,
      email: true,
      banned: true,
      createdAt: true,
      courseMemberships: { orderBy: { course: { position: "asc" } }, select: { course: { select: { id: true, title: true } } } },
      profile: { select: { phone: true, birthDate: true, gender: true, city: true, notes: true } },
      accounts: { where: { providerId: "credential", password: { not: null } }, select: { id: true }, take: 1 },
    },
  });
  if (!student) return null;
  const [classes, upcoming] = await Promise.all([
    heldClasses({ userIds: [userId], now }),
    prisma.lesson.findMany({
      where: { isDemo: false, publication: "PUBLISHED", scheduledEndAt: { gt: now }, enrollments: { some: { userId, revokedAt: null } } },
      orderBy: { scheduledStartAt: "asc" },
      take: 20,
      select: { id: true, title: true, scheduledStartAt: true, scheduledEndAt: true, course: { select: { title: true } } },
    }),
  ]);
  classes.sort((a, b) => b.scheduledStartAt.getTime() - a.scheduledStartAt.getTime());
  return {
    student: { ...student, courses: student.courseMemberships.map((m) => m.course), hasPassword: student.accounts.length > 0 },
    classes,
    summary: summarizeParticipation(classes),
    upcoming: upcoming.map((l) => ({ ...l, courseTitle: l.course?.title ?? null })),
  };
}

/** Percentage (0-100, rounded), or null when there was nothing to attend. */
export const attendanceRate = ({ available, attended }: Participation) => (available ? Math.round((attended / available) * 100) : null);
