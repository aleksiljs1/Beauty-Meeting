import { addDays, addMonths } from "./datetime";

/**
 * Course billing, shared by server and browser. Payments are made outside the site (cash or
 * bank transfer) and recorded by the admin; nothing here moves money.
 *
 * A course runs `durationMonths` course months from `startsOn`. Course month k starts on
 * `startsOn` + (k − 1) calendar months and is shown as "Year ⌈k/12⌉ · Month ((k − 1) mod 12) + 1".
 * A student pays from their `firstMonth` (later than 1 when they joined late). Payments cover
 * whole months in order, so a student's paid months are always firstMonth … paidThroughMonth.
 * Dates are calendar days ("YYYY-MM-DD") in academy time, so plain string comparison works.
 */

/** A month that starts within this many days counts as "due soon". */
export const DUE_SOON_DAYS = 7;

export type BillingStatus = "OVERDUE" | "DUE_SOON" | "PAID" | "COMPLETE";

export type CourseBilling = { startsOn: string; durationMonths: number; monthlyPriceCents: number | null };
const parse = (date: string) => date.split("-").map(Number) as [number, number, number];

export const courseMonthStart = (startsOn: string, month: number) => addMonths(startsOn, month - 1);

/** The course month `day` falls in: 0 before the course starts, past `durationMonths` after it ends. */
export function courseMonthAt(startsOn: string, day: string): number {
  if (day < startsOn) return 0;
  const [sy, sm] = parse(startsOn);
  const [y, m] = parse(day);
  let month = (y - sy) * 12 + (m - sm) + 1;
  if (courseMonthStart(startsOn, month) > day) month -= 1;
  return month;
}

/** Month a student joining on `day` starts paying from. */
export function joiningMonth(course: Pick<CourseBilling, "startsOn" | "durationMonths">, day: string): number {
  return Math.min(Math.max(1, courseMonthAt(course.startsOn, day)), course.durationMonths);
}

export const courseMonthLabel = (month: number) => ({ year: Math.ceil(month / 12), month: ((month - 1) % 12) + 1 });

export type BillingSummary = {
  status: BillingStatus;
  /** Last paid course month (firstMonth − 1 when nothing is paid). */
  paidThroughMonth: number;
  /** Last day covered by payments, or null when nothing is paid. */
  paidUntil: string | null;
  /** First unpaid month and the day it is due, or null when every month is paid. */
  nextDueMonth: number | null;
  nextDueOn: string | null;
  /** Months that have started but aren't paid, and what they cost. */
  monthsOwed: number;
  amountOwedCents: number | null;
  /** Unpaid months until the end of the course (owed ones included), and what they cost. */
  monthsLeft: number;
  amountLeftCents: number | null;
};

export function billingSummary(course: CourseBilling, member: { firstMonth: number; monthsPaid: number }, today: string): BillingSummary {
  const { startsOn, durationMonths, monthlyPriceCents: price } = course;
  const paidThroughMonth = Math.min(member.firstMonth - 1 + member.monthsPaid, durationMonths);
  const started = Math.min(courseMonthAt(startsOn, today), durationMonths);
  const monthsOwed = Math.max(0, started - paidThroughMonth);
  const monthsLeft = durationMonths - paidThroughMonth;
  const nextDueMonth = monthsLeft > 0 ? paidThroughMonth + 1 : null;
  const nextDueOn = nextDueMonth ? courseMonthStart(startsOn, nextDueMonth) : null;
  const cost = (months: number) => (price === null ? null : months * price);

  let status: BillingStatus = "PAID";
  if (!nextDueOn) status = "COMPLETE";
  else if (monthsOwed > 0) status = "OVERDUE";
  else if (nextDueOn <= addDays(today, DUE_SOON_DAYS)) status = "DUE_SOON";

  return {
    status,
    paidThroughMonth,
    paidUntil: member.monthsPaid > 0 ? addDays(courseMonthStart(startsOn, paidThroughMonth + 1), -1) : null,
    nextDueMonth,
    nextDueOn,
    monthsOwed,
    amountOwedCents: cost(monthsOwed),
    monthsLeft,
    amountLeftCents: cost(monthsLeft),
  };
}

const euro = new Intl.NumberFormat("sq-AL", { style: "currency", currency: "EUR" });
export const formatEuro = (cents: number) => euro.format(cents / 100);

/** "40", "40,5", "40.50" → 4050; null for anything else. */
export function parseEuroCents(value: string): number | null {
  const match = /^(\d{1,6})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  return match ? Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0")) : null;
}

export const centsToEuroInput = (cents: number) => (cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100));
