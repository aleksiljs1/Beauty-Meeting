import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { billingSummary } from "@/lib/billing";
import { fromDbDate, toDbDate, todayInAcademy } from "@/lib/datetime";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/http";
import { audit } from "./audit";

/**
 * Recording what students paid for a course (the money itself changes hands outside the site).
 * The rules live in src/lib/billing.ts; this file only enforces them when writing.
 */

/** The course's billing setup, or a clear error when the admin hasn't set it up yet. */
export async function courseBilling(courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { startsOn: true, durationMonths: true, monthlyPriceCents: true } });
  if (!course) throw new ApiError("NOT_FOUND", "Kursi nuk u gjet.");
  if (!course.startsOn || !course.durationMonths) {
    throw new ApiError("CONFLICT", "Vendosni datën e fillimit dhe kohëzgjatjen e kursit para se të regjistroni pagesa.");
  }
  return { startsOn: fromDbDate(course.startsOn), durationMonths: course.durationMonths, monthlyPriceCents: course.monthlyPriceCents };
}

/**
 * Before a course's billing setup changes: once payments are recorded, the course can't lose its
 * start date or length, or get shorter than the months someone already paid for.
 */
export async function assertBillingChangeKeepsPayments(courseId: string, change: { startsOn?: Date | null; durationMonths?: number | null }) {
  const removing = change.startsOn === null || change.durationMonths === null;
  if (!removing && change.durationMonths === undefined) return;
  const [paid, starts] = await Promise.all([
    prisma.payment.groupBy({ by: ["userId"], where: { courseId, cancelledAt: null }, _sum: { months: true } }),
    prisma.billingStart.findMany({ where: { courseId }, select: { userId: true, firstMonth: true } }),
  ]);
  if (!paid.length) return;
  if (removing) throw new ApiError("CONFLICT", "Ky kurs ka pagesa të regjistruara, ndaj data e fillimit dhe kohëzgjatja nuk mund të hiqen.");
  const firstMonth = new Map(starts.map((s) => [s.userId, s.firstMonth]));
  const paidThrough = Math.max(...paid.map((p) => (firstMonth.get(p.userId) ?? 1) - 1 + (p._sum.months ?? 0)));
  if (change.durationMonths! < paidThrough) {
    throw new ApiError("CONFLICT", `Dikush e ka paguar kursin deri në muajin ${paidThrough}, ndaj kohëzgjatja nuk mund të jetë më e shkurtër.`);
  }
}

async function assertMember(courseId: string, userId: string) {
  const member = await prisma.courseMember.findUnique({ where: { courseId_userId: { courseId, userId } }, select: { id: true } });
  if (!member) throw new ApiError("NOT_FOUND", "Studenti nuk është në këtë kurs.");
}

/**
 * Locks the student's billing for this course for the rest of the transaction, so payments and
 * start-month changes for one student happen one at a time (two quick clicks can't overpay).
 */
async function lockBilling(tx: Prisma.TransactionClient, courseId: string, userId: string) {
  await tx.billingStart.upsert({ where: { courseId_userId: { courseId, userId } }, create: { courseId, userId }, update: {} });
  const [row] = await tx.$queryRaw<{ firstMonth: number }[]>`
    SELECT "firstMonth" FROM "BillingStart" WHERE "courseId" = ${courseId}::uuid AND "userId" = ${userId} FOR UPDATE`;
  const paid = await tx.payment.aggregate({ where: { courseId, userId, cancelledAt: null }, _sum: { months: true } });
  return { firstMonth: row.firstMonth, monthsPaid: paid._sum.months ?? 0 };
}

export type RecordPaymentInput = { courseId: string; userId: string; months: number; amountCents: number; paidOn: string; method: PaymentMethod; note?: string | null };

/** Records a payment for the next `months` unpaid months; never past the end of the course. */
export async function recordPayment(input: RecordPaymentInput, admin: AppUser, now = new Date()) {
  const course = await courseBilling(input.courseId);
  await assertMember(input.courseId, input.userId);
  const today = todayInAcademy(now);
  if (input.paidOn > today) throw new ApiError("VALIDATION_FAILED", "Data e pagesës nuk mund të jetë në të ardhmen.");

  const payment = await prisma.$transaction(async (tx) => {
    const { monthsLeft } = billingSummary(course, await lockBilling(tx, input.courseId, input.userId), today);
    if (input.months > monthsLeft) {
      throw new ApiError("CONFLICT", monthsLeft ? `Kanë mbetur vetëm ${monthsLeft} muaj pa paguar deri në fund të kursit.` : "Kursi është paguar i gjithi.");
    }
    return tx.payment.create({
      data: { ...input, note: input.note?.trim() || null, paidOn: toDbDate(input.paidOn), recordedById: admin.id },
      select: { id: true },
    });
  });
  await audit(admin.id, "payment.record", "user", input.userId, { courseId: input.courseId, paymentId: payment.id, months: input.months, amountCents: input.amountCents });
  return payment;
}

/** Mistakes are cancelled with a reason, never deleted, so the history stays complete. */
export async function cancelPayment(paymentId: string, reason: string, admin: AppUser) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, select: { userId: true, courseId: true } });
  if (!payment) throw new ApiError("NOT_FOUND", "Pagesa nuk u gjet.");
  const { count } = await prisma.payment.updateMany({ where: { id: paymentId, cancelledAt: null }, data: { cancelledAt: new Date(), cancelReason: reason.trim() } });
  if (!count) throw new ApiError("CONFLICT", "Kjo pagesë është anuluar tashmë.");
  await audit(admin.id, "payment.cancel", "user", payment.userId, { courseId: payment.courseId, paymentId });
}

/** Changes the course month a student pays from (e.g. they joined in month 2). */
export async function setFirstMonth(courseId: string, userId: string, firstMonth: number, admin: AppUser) {
  const course = await courseBilling(courseId);
  await assertMember(courseId, userId);
  if (firstMonth > course.durationMonths) throw new ApiError("VALIDATION_FAILED", `Kursi ka vetëm ${course.durationMonths} muaj.`);
  const from = await prisma.$transaction(async (tx) => {
    const current = await lockBilling(tx, courseId, userId);
    if (firstMonth - 1 + current.monthsPaid > course.durationMonths) {
      throw new ApiError("CONFLICT", "Me këtë muaj fillimi, pagesat e regjistruara do të kalonin fundin e kursit.");
    }
    await tx.billingStart.update({ where: { courseId_userId: { courseId, userId } }, data: { firstMonth } });
    return current.firstMonth;
  });
  await audit(admin.id, "payment.first_month", "user", userId, { courseId, from, to: firstMonth });
}
