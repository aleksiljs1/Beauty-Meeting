import "server-only";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { billingSummary, fromDbDate, toDbDate } from "@/lib/billing";
import { todayInAcademy } from "@/lib/datetime";
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

async function findMember(courseId: string, userId: string) {
  const member = await prisma.courseMember.findUnique({ where: { courseId_userId: { courseId, userId } }, select: { id: true, firstMonth: true } });
  if (!member) throw new ApiError("NOT_FOUND", "Studenti nuk është në këtë kurs.");
  return member;
}

const monthsPaid = async (courseId: string, userId: string, db: Pick<typeof prisma, "payment"> = prisma) =>
  (await db.payment.aggregate({ where: { courseId, userId, cancelledAt: null }, _sum: { months: true } }))._sum.months ?? 0;

export type RecordPaymentInput = { courseId: string; userId: string; months: number; amountCents: number; paidOn: string; method: PaymentMethod; note?: string | null };

/** Records a payment for the next `months` unpaid months; never past the end of the course. */
export async function recordPayment(input: RecordPaymentInput, admin: AppUser, now = new Date()) {
  const course = await courseBilling(input.courseId);
  const member = await findMember(input.courseId, input.userId);
  const today = todayInAcademy(now);
  if (input.paidOn > today) throw new ApiError("VALIDATION_FAILED", "Data e pagesës nuk mund të jetë në të ardhmen.");

  const payment = await prisma.$transaction(async (tx) => {
    // One writer per student and course at a time, so two quick clicks can't overpay the course.
    await tx.$queryRaw`SELECT 1 FROM "CourseMember" WHERE id = ${member.id}::uuid FOR UPDATE`;
    const { monthsLeft } = billingSummary(course, { firstMonth: member.firstMonth, monthsPaid: await monthsPaid(input.courseId, input.userId, tx) }, today);
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
  const member = await findMember(courseId, userId);
  if (firstMonth > course.durationMonths) throw new ApiError("VALIDATION_FAILED", `Kursi ka vetëm ${course.durationMonths} muaj.`);
  if (firstMonth - 1 + (await monthsPaid(courseId, userId)) > course.durationMonths) {
    throw new ApiError("CONFLICT", "Me këtë muaj fillimi, pagesat e regjistruara do të kalonin fundin e kursit.");
  }
  await prisma.courseMember.update({ where: { id: member.id }, data: { firstMonth } });
  await audit(admin.id, "payment.first_month", "user", userId, { courseId, from: member.firstMonth, to: firstMonth });
}
