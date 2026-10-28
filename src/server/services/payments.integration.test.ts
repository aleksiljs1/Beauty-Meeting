import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser, resetDatabase } from "@/test/fixtures";

const { cancelPayment, recordPayment, setFirstMonth } = await import("./payments");
const { setStudentCourses } = await import("./course-members");
const { deleteCourse, updateCourse } = await import("./content");
const { deleteStudent } = await import("./students");
const { getPaymentAlerts, getPaymentHistory, listPaymentAccounts } = await import("@/server/queries/payments");
const { prisma } = await import("@/server/db");

let admin: Awaited<ReturnType<typeof createUser>>;

beforeEach(async () => {
  await resetDatabase();
  admin = await createUser("admin");
});

/** A 2-year, 2-month course that started on 1 Nov 2026, at 40 € a month. */
const course = () =>
  prisma.course.create({
    data: { title: "Grim profesional", slug: `grim-${Date.now()}`, startsOn: new Date("2026-11-01T00:00:00Z"), durationMonths: 26, monthlyPriceCents: 4000 },
  });

const pay = (courseId: string, userId: string, months: number, paidOn = "2026-11-02") =>
  recordPayment({ courseId, userId, months, amountCents: months * 4000, paidOn, method: "CASH" }, admin, new Date("2027-02-03T10:00:00Z"));

const account = async (userId: string, now: Date) => (await listPaymentAccounts({}, now)).accounts.find((a) => a.userId === userId)!;

describe("course payments", () => {
  it("tracks a late joiner who paid one month and a student who paid a year", async () => {
    const { id: courseId } = await course();
    const [late, yearly] = [await createUser("student"), await createUser("student")];
    // Student 1 is added during month 2 and starts paying from there.
    await setStudentCourses(late.id, [courseId], admin, { now: new Date("2026-12-05T10:00:00Z") });
    await setStudentCourses(yearly.id, [courseId], admin, { now: new Date("2026-10-20T10:00:00Z") });
    await pay(courseId, late.id, 1, "2026-12-05");
    await pay(courseId, yearly.id, 12);

    const feb = new Date("2027-02-03T10:00:00Z");
    expect(await account(late.id, feb)).toMatchObject({ firstMonth: 2, status: "OVERDUE", paidUntil: "2026-12-31", monthsOwed: 2, amountOwedCents: 8000 });
    expect(await account(yearly.id, feb)).toMatchObject({ firstMonth: 1, status: "PAID", paidUntil: "2027-10-31", amountPaidCents: 48000, monthsLeft: 14 });
    expect(await getPaymentAlerts(feb)).toEqual({ overdue: 1, dueSoon: 0, amountOwedCents: 8000 });
  });

  it("never records more months than the course has left", async () => {
    const { id: courseId } = await course();
    const student = await createUser("student");
    await setStudentCourses(student.id, [courseId], admin, { now: new Date("2026-10-20T10:00:00Z") });
    await pay(courseId, student.id, 20);
    await expect(pay(courseId, student.id, 7)).rejects.toMatchObject({ code: "CONFLICT" });
    await pay(courseId, student.id, 6);
    expect(await account(student.id, new Date("2029-01-01T10:00:00Z"))).toMatchObject({ status: "COMPLETE", monthsLeft: 0 });
  });

  it("keeps cancelled payments in the history but stops counting them", async () => {
    const { id: courseId } = await course();
    const student = await createUser("student");
    await setStudentCourses(student.id, [courseId], admin, { now: new Date("2026-10-20T10:00:00Z") });
    const wrong = await pay(courseId, student.id, 3);
    await pay(courseId, student.id, 1, "2026-11-03");
    await cancelPayment(wrong.id, "U regjistrua dy herë", admin);
    await expect(cancelPayment(wrong.id, "Përsëri", admin)).rejects.toMatchObject({ code: "CONFLICT" });

    const history = await getPaymentHistory(courseId, student.id);
    expect(history.map((p) => [p.months, p.fromMonth, p.toMonth, p.cancelReason])).toEqual([
      [3, null, null, "U regjistrua dy herë"],
      [1, 1, 1, null],
    ]);
    expect(await account(student.id, new Date("2026-11-10T10:00:00Z"))).toMatchObject({ monthsPaid: 1, amountPaidCents: 4000 });
  });

  it("lets the admin move a student's first month, but not past the end of the course", async () => {
    const { id: courseId } = await course();
    const student = await createUser("student");
    await setStudentCourses(student.id, [courseId], admin, { now: new Date("2026-10-20T10:00:00Z") });
    await setFirstMonth(courseId, student.id, 2, admin);
    expect(await account(student.id, new Date("2026-11-26T10:00:00Z"))).toMatchObject({ firstMonth: 2, status: "DUE_SOON", nextDueOn: "2026-12-01" });

    await pay(courseId, student.id, 25);
    await expect(setFirstMonth(courseId, student.id, 3, admin)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses payments before billing is set up, for non-members and in the future", async () => {
    const unbilled = await prisma.course.create({ data: { title: "Pa çmim", slug: "pa-cmim" } });
    const { id: courseId } = await course();
    const student = await createUser("student");
    await setStudentCourses(student.id, [unbilled.id], admin);
    await expect(pay(unbilled.id, student.id, 1)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(pay(courseId, student.id, 1)).rejects.toMatchObject({ code: "NOT_FOUND" });

    await setStudentCourses(student.id, [unbilled.id, courseId], admin);
    await expect(pay(courseId, student.id, 1, "2027-03-01")).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect((await listPaymentAccounts()).unbilledCourses).toEqual([{ id: unbilled.id, title: "Pa çmim" }]);
  });

  it("won't delete a course that has payments", async () => {
    const { id: courseId } = await course();
    const student = await createUser("student");
    await setStudentCourses(student.id, [courseId], admin);
    await pay(courseId, student.id, 1);
    await expect(deleteCourse(admin, courseId)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("keeps a returning student's paid months where they were", async () => {
    const { id: courseId } = await course();
    const student = await createUser("student");
    await setStudentCourses(student.id, [courseId], admin, { now: new Date("2026-12-05T10:00:00Z") }); // pays from month 2
    await pay(courseId, student.id, 2, "2026-12-05");
    await setStudentCourses(student.id, [], admin);
    // Back in month 5: the two paid months are still months 2–3, so months 4 and 5 are owed.
    const march = new Date("2027-03-10T10:00:00Z");
    await setStudentCourses(student.id, [courseId], admin, { now: march });
    expect(await account(student.id, march)).toMatchObject({ firstMonth: 2, paidThroughMonth: 3, monthsOwed: 2 });

    // Without payments, coming back starts from the month they return in.
    const other = await createUser("student");
    await setStudentCourses(other.id, [courseId], admin, { now: new Date("2026-11-05T10:00:00Z") });
    await setStudentCourses(other.id, [], admin);
    await setStudentCourses(other.id, [courseId], admin, { now: march });
    expect(await account(other.id, march)).toMatchObject({ firstMonth: 5 });
  });

  it("won't delete a student who has payments", async () => {
    const { id: courseId } = await course();
    const student = await createUser("student");
    await setStudentCourses(student.id, [courseId], admin);
    await pay(courseId, student.id, 1);
    await expect(deleteStudent(student.id, admin)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await prisma.payment.count({ where: { userId: student.id } })).toBe(1);
  });

  it("won't shorten a course below what someone paid, or drop its billing", async () => {
    const { id: courseId } = await course();
    const student = await createUser("student");
    await setStudentCourses(student.id, [courseId], admin, { now: new Date("2026-10-20T10:00:00Z") });
    await pay(courseId, student.id, 14);
    await expect(updateCourse(admin, courseId, { duration: { years: "1", months: "0" } })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(updateCourse(admin, courseId, { startsOn: "" })).rejects.toMatchObject({ code: "CONFLICT" });
    await updateCourse(admin, courseId, { duration: { years: "1", months: "2" } });
    expect((await prisma.course.findUniqueOrThrow({ where: { id: courseId } })).durationMonths).toBe(14);
  });
});
