import "server-only";
import { addMonths, fromZonedInputValue, todayInAcademy } from "@/lib/datetime";
import { prisma } from "@/server/db";
import { getPaymentAlerts } from "./payments";
import { attendanceRate, heldClasses, summarizeParticipation, type HeldClass } from "./participation";

/**
 * The admin's statistics page: money, attendance, students and ratings, all from data the app
 * already keeps. Amounts are cents; months are the academy's (Tirana) calendar months.
 */

const MONTHS_SHOWN = 12;
const ATTENDANCE_DAYS = 30;
const RATING_DAYS = 90;
/** A student is "at risk" after missing this many of their latest classes in a row… */
const AT_RISK_MISSES = 2;
/** …the latest of them within this many days (students of finished courses drop off). */
const AT_RISK_DAYS = ATTENDANCE_DAYS;

export type MonthIncome = { month: string; cents: number };

export async function getAcademyStats(now = new Date()) {
  const today = todayInAcademy(now);
  const thisMonth = `${today.slice(0, 7)}-01`;
  const firstShown = addMonths(thisMonth, -(MONTHS_SHOWN - 1));
  const attendanceSince = new Date(now.getTime() - ATTENDANCE_DAYS * 86_400_000);
  const ratingSince = new Date(now.getTime() - RATING_DAYS * 86_400_000);

  const [payments, alerts, classes, ratings, courses, members, newStudents] = await Promise.all([
    prisma.payment.findMany({ where: { cancelledAt: null }, select: { amountCents: true, paidOn: true, courseId: true } }),
    getPaymentAlerts(now),
    heldClasses({ now }),
    prisma.feedback.findMany({ where: { topic: { in: ["LESSON", "COURSE"] } }, select: { rating: true, createdAt: true, lessonId: true, courseId: true, lesson: { select: { courseId: true } } } }),
    prisma.course.findMany({ orderBy: { position: "asc" }, select: { id: true, title: true } }),
    prisma.courseMember.groupBy({ by: ["courseId"], where: { user: { role: "student", banned: { not: true } } }, _count: { _all: true } }),
    prisma.user.count({ where: { role: "student", createdAt: { gte: fromZonedInputValue(`${thisMonth}T00:00`)! } } }), // Tirana midnight
  ]);

  // Money by month (paidOn is a calendar date, already the academy's day).
  const income = new Map<string, number>();
  for (let i = 0; i < MONTHS_SHOWN; i++) income.set(addMonths(firstShown, i).slice(0, 7), 0);
  for (const p of payments) {
    const month = p.paidOn.toISOString().slice(0, 7);
    if (income.has(month)) income.set(month, income.get(month)! + p.amountCents);
  }
  const monthly: MonthIncome[] = [...income].map(([month, cents]) => ({ month, cents }));
  const collectedThisMonth = monthly.at(-1)!.cents;
  const collectedLastMonth = monthly.at(-2)!.cents;

  const recent = classes.filter((c) => c.scheduledStartAt >= attendanceSince);
  const recentRatings = ratings.filter((r) => r.createdAt >= ratingSince);

  const activeStudents = await prisma.user.findMany({ where: { role: "student", banned: { not: true } }, select: { id: true, name: true } });
  const atRisk = studentsAtRisk(classes, activeStudents, new Date(now.getTime() - AT_RISK_DAYS * 86_400_000));

  const byCourse = courses.map((course) => {
    const courseClasses = classes.filter((c) => c.courseId === course.id);
    const courseRatings = ratings.filter((r) => r.courseId === course.id || r.lesson?.courseId === course.id);
    return {
      ...course,
      students: members.find((m) => m.courseId === course.id)?._count._all ?? 0,
      attendance: attendanceRate(summarizeParticipation(courseClasses)),
      incomeCents: payments.filter((p) => p.courseId === course.id).reduce((sum, p) => sum + p.amountCents, 0),
      rating: average(courseRatings.map((r) => r.rating)),
      ratingCount: courseRatings.length,
    };
  });

  return {
    collectedThisMonth,
    collectedLastMonth,
    owedCents: alerts.amountOwedCents,
    overdueStudents: alerts.overdue,
    attendance: attendanceRate(summarizeParticipation(recent)),
    attendanceClasses: recent.length,
    rating: average(recentRatings.map((r) => r.rating)),
    ratingCount: recentRatings.length,
    activeStudents: activeStudents.length,
    newStudents,
    monthly,
    atRisk,
    byCourse,
    periods: { attendanceDays: ATTENDANCE_DAYS, ratingDays: RATING_DAYS, atRiskMisses: AT_RISK_MISSES, atRiskDays: AT_RISK_DAYS },
  };
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

/** Active students whose latest classes (at least AT_RISK_MISSES, the last one since `since`) were all missed, longest streak first. */
function studentsAtRisk(classes: HeldClass[], students: { id: string; name: string }[], since: Date) {
  const byStudent = new Map<string, HeldClass[]>();
  for (const c of classes) byStudent.set(c.userId, [...(byStudent.get(c.userId) ?? []), c]);
  return students
    .flatMap((s) => {
      const latest = (byStudent.get(s.id) ?? []).sort((a, b) => b.scheduledStartAt.getTime() - a.scheduledStartAt.getTime());
      if (!latest[0] || latest[0].scheduledStartAt < since) return [];
      const streak = latest.findIndex((c) => c.attended);
      const missedInRow = streak === -1 ? latest.length : streak;
      return [{ ...s, missedInRow, lastAttended: latest.find((c) => c.attended)?.scheduledStartAt ?? null }];
    })
    .filter((s) => s.missedInRow >= AT_RISK_MISSES)
    .sort((a, b) => b.missedInRow - a.missedInRow || a.name.localeCompare(b.name));
}
