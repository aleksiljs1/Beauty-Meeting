import "server-only";
import { billingSummary, type BillingStatus, type BillingSummary } from "@/lib/billing";
import { fromDbDate, todayInAcademy } from "@/lib/datetime";
import { prisma } from "@/server/db";

/** Read models for the admin "Pagesat" page and dashboard. Callers must already be admins. */

const MAX_ACCOUNTS = 2_000;
const STATUS_ORDER: BillingStatus[] = ["OVERDUE", "DUE_SOON", "PAID", "COMPLETE"];

export type PaymentAccount = {
  courseId: string;
  courseTitle: string;
  userId: string;
  name: string;
  email: string;
  active: boolean;
  firstMonth: number;
  durationMonths: number;
  monthlyPriceCents: number | null;
  monthsPaid: number;
  amountPaidCents: number;
} & BillingSummary;

/** Every student of every course that has billing set up, with what they paid and owe today. */
export async function listPaymentAccounts(filter: { courseId?: string } = {}, now = new Date()) {
  const today = todayInAcademy(now);
  const courses = await prisma.course.findMany({
    where: filter.courseId ? { id: filter.courseId } : {},
    orderBy: [{ position: "asc" }, { title: "asc" }],
    select: { id: true, title: true, startsOn: true, durationMonths: true, monthlyPriceCents: true, _count: { select: { members: true } } },
  });
  const billed = courses.filter((c) => c.startsOn && c.durationMonths);
  const courseIds = billed.map((c) => c.id);
  const [members, starts, sums] = await Promise.all([
    prisma.courseMember.findMany({
      where: { courseId: { in: courseIds }, user: { role: "student" } },
      orderBy: { user: { name: "asc" } },
      take: MAX_ACCOUNTS,
      select: { courseId: true, user: { select: { id: true, name: true, email: true, banned: true } } },
    }),
    prisma.billingStart.findMany({ where: { courseId: { in: courseIds } }, select: { courseId: true, userId: true, firstMonth: true } }),
    prisma.payment.groupBy({
      by: ["courseId", "userId"],
      where: { courseId: { in: courseIds }, cancelledAt: null },
      _sum: { months: true, amountCents: true },
    }),
  ]);

  const courseById = new Map(billed.map((c) => [c.id, c]));
  const paid = new Map(sums.map((s) => [`${s.courseId}:${s.userId}`, s._sum]));
  const firstMonths = new Map(starts.map((s) => [`${s.courseId}:${s.userId}`, s.firstMonth]));
  const accounts: PaymentAccount[] = members.map(({ courseId, user }) => {
    const course = courseById.get(courseId)!;
    const firstMonth = firstMonths.get(`${courseId}:${user.id}`) ?? 1;
    const billing = { startsOn: fromDbDate(course.startsOn!), durationMonths: course.durationMonths!, monthlyPriceCents: course.monthlyPriceCents };
    const sum = paid.get(`${courseId}:${user.id}`);
    const monthsPaid = sum?.months ?? 0;
    return {
      courseId,
      courseTitle: course.title,
      userId: user.id,
      name: user.name,
      email: user.email,
      active: !user.banned,
      firstMonth,
      durationMonths: billing.durationMonths,
      monthlyPriceCents: billing.monthlyPriceCents,
      monthsPaid,
      amountPaidCents: sum?.amountCents ?? 0,
      ...billingSummary(billing, { firstMonth, monthsPaid }, today),
    };
  });
  accounts.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));

  return {
    accounts,
    /** Courses with students whose billing isn't set up yet, so the page can say why they're missing. */
    unbilledCourses: courses.filter((c) => !courseById.has(c.id) && c._count.members > 0).map((c) => ({ id: c.id, title: c.title })),
  };
}

/** For the dashboard: active students who owe money now or soon. */
export async function getPaymentAlerts(now = new Date()) {
  const active = (await listPaymentAccounts({}, now)).accounts.filter((a) => a.active);
  const overdue = active.filter((a) => a.status === "OVERDUE");
  return {
    overdue: overdue.length,
    dueSoon: active.filter((a) => a.status === "DUE_SOON").length,
    amountOwedCents: overdue.reduce((total, a) => total + (a.amountOwedCents ?? 0), 0),
  };
}

export type PaymentHistoryEntry = {
  id: string;
  months: number;
  amountCents: number;
  paidOn: string;
  method: "CASH" | "BANK" | "OTHER";
  note: string | null;
  recordedBy: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  /** Course months this payment covers (null when cancelled). */
  fromMonth: number | null;
  toMonth: number | null;
};

/** One student's payments for a course, oldest first, with the months each one covers. */
export async function getPaymentHistory(courseId: string, userId: string): Promise<PaymentHistoryEntry[]> {
  const [start, payments] = await Promise.all([
    prisma.billingStart.findUnique({ where: { courseId_userId: { courseId, userId } }, select: { firstMonth: true } }),
    prisma.payment.findMany({
      where: { courseId, userId },
      orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }],
      take: 500,
      select: { id: true, months: true, amountCents: true, paidOn: true, method: true, note: true, cancelledAt: true, cancelReason: true, recordedBy: { select: { name: true } } },
    }),
  ]);
  let next = start?.firstMonth ?? 1;
  return payments.map(({ recordedBy, paidOn, ...p }) => {
    const covers = p.cancelledAt ? null : { fromMonth: next, toMonth: (next += p.months) - 1 };
    return { ...p, paidOn: fromDbDate(paidOn), recordedBy: recordedBy?.name ?? null, fromMonth: covers?.fromMonth ?? null, toMonth: covers?.toMonth ?? null };
  });
}
