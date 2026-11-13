import "dotenv/config";
import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";
import { createLesson, createUser, resetDatabase } from "@/test/fixtures";

const { buildAcademyExport } = await import("./export");
const { recordPayment } = await import("./payments");
const { setStudentCourses } = await import("./course-members");
const { getPaymentReceipt, listPaymentAccounts } = await import("@/server/queries/payments");
const { listLessons } = await import("@/server/queries/admin");
const { prisma } = await import("@/server/db");

let admin: Awaited<ReturnType<typeof createUser>>;

beforeEach(async () => {
  await resetDatabase();
  admin = await createUser("admin");
});

const course = (title: string) =>
  prisma.course.create({ data: { title, slug: `k-${title.length}-${Date.now()}`, startsOn: new Date("2026-11-01T00:00:00Z"), durationMonths: 12, monthlyPriceCents: 4000 } });

describe("Excel export", () => {
  it("has the students, their payments and a sheet for attendance", async () => {
    const { id: courseId } = await course("Grim profesional");
    const student = await createUser("student");
    await setStudentCourses(student.id, [courseId], admin, { now: new Date("2026-11-02T10:00:00Z") });
    await recordPayment({ courseId, userId: student.id, months: 2, amountCents: 8000, paidOn: "2026-11-02", method: "CASH" }, admin, new Date("2026-11-03T10:00:00Z"));

    const { file, filename } = await buildAcademyExport();
    expect(filename).toMatch(/^akademia-eksport-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file);
    expect(workbook.worksheets.map((w) => w.name)).toEqual(["Studentët", "Pagesat", "Pjesëmarrja"]);
    expect(workbook.getWorksheet("Studentët")!.getRow(2).getCell(2).value).toBe(student.email);
    const payment = workbook.getWorksheet("Pagesat")!.getRow(2);
    expect([payment.getCell(1).value, payment.getCell(4).value, payment.getCell(6).value]).toEqual(["02/11/2026", "Grim profesional", 80]);
  });
});

describe("payments of one student and the printable confirmation", () => {
  it("lists only that student's courses and shows the months a payment covers", async () => {
    const { id: courseId } = await course("Manikyr");
    const [student, other] = [await createUser("student"), await createUser("student")];
    for (const s of [student, other]) await setStudentCourses(s.id, [courseId], admin, { now: new Date("2026-11-02T10:00:00Z") });
    const { id } = await recordPayment({ courseId, userId: student.id, months: 3, amountCents: 12000, paidOn: "2026-11-05", method: "BANK" }, admin, new Date("2026-11-06T10:00:00Z"));

    expect((await listPaymentAccounts({ userId: student.id })).accounts.map((a) => a.userId)).toEqual([student.id]);
    expect(await getPaymentReceipt(id)).toMatchObject({ courseTitle: "Manikyr", studentEmail: student.email, fromMonth: 1, toMonth: 3, amountCents: 12000 });
    expect(await getPaymentReceipt("00000000-0000-7000-8000-000000000000")).toBeNull();
  });
});

describe("lessons list search", () => {
  it("finds lessons by title (with % and _ as plain text) and by course", async () => {
    const { id: courseId } = await course("Flokë");
    await createLesson(admin.id, { title: "Lyerje flokësh 100%", courseId });
    await createLesson(admin.id, { title: "Manikyr bazë" });
    const titles = async (filter: Parameters<typeof listLessons>[0]) => (await listLessons(filter)).items.map((i) => i.title);

    expect(await titles({ q: "LYERJE" })).toEqual(["Lyerje flokësh 100%"]);
    expect(await titles({ q: "100%" })).toEqual(["Lyerje flokësh 100%"]);
    expect(await titles({ q: "_" })).toEqual([]);
    expect(await titles({ courseId })).toEqual(["Lyerje flokësh 100%"]);
  });
});
