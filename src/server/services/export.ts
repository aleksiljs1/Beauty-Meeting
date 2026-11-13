import "server-only";
import ExcelJS from "exceljs";
import { admin } from "@/i18n/admin";
import { fromDbDate, todayInAcademy, toZonedInputValue } from "@/lib/datetime";
import { prisma } from "@/server/db";
import { heldClasses } from "@/server/queries/participation";

/**
 * The owner's export: students, payments and attendance in one Excel file. It is also her own
 * copy of the academy's records, so nothing is left out (deactivated students, cancelled payments).
 */

const MAX_ROWS = 50_000;
const s = admin.students.profile;
const methods = admin.payments.record.methods;

/** "28/03/1998" from "1998-03-28". */
const day = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
/** "28/03/2026 17:00", academy time. */
const dateTime = (value: Date) => {
  const zoned = toZonedInputValue(value);
  return `${day(zoned.slice(0, 10))} ${zoned.slice(11)}`;
};

function addSheet(workbook: ExcelJS.Workbook, name: string, columns: { header: string; width: number }[], rows: (string | number | null)[][]) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = columns;
  sheet.getRow(1).font = { bold: true };
  sheet.addRows(rows);
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
}

export async function buildAcademyExport(now = new Date()) {
  const [students, payments, classes] = await Promise.all([
    prisma.user.findMany({
      where: { role: "student" },
      orderBy: { name: "asc" },
      take: MAX_ROWS,
      select: {
        id: true,
        name: true,
        email: true,
        banned: true,
        createdAt: true,
        profile: { select: { phone: true, birthDate: true, gender: true, city: true, notes: true } },
        courseMemberships: { orderBy: { course: { position: "asc" } }, select: { course: { select: { title: true } } } },
      },
    }),
    prisma.payment.findMany({
      orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }],
      take: MAX_ROWS,
      select: {
        paidOn: true,
        months: true,
        amountCents: true,
        method: true,
        note: true,
        cancelledAt: true,
        cancelReason: true,
        course: { select: { title: true } },
        user: { select: { name: true, email: true } },
        recordedBy: { select: { name: true } },
      },
    }),
    heldClasses({ now }),
  ]);

  const attended = new Map<string, { available: number; came: number }>();
  for (const c of classes) {
    const entry = attended.get(c.userId) ?? { available: 0, came: 0 };
    entry.available += 1;
    if (c.attended) entry.came += 1;
    attended.set(c.userId, entry);
  }
  const nameOf = new Map(students.map((st) => [st.id, st]));

  const workbook = new ExcelJS.Workbook();
  workbook.created = now;

  addSheet(
    workbook,
    "Studentët",
    [
      { header: "Emri", width: 26 },
      { header: "Email", width: 30 },
      { header: "Telefoni", width: 18 },
      { header: "Datëlindja", width: 12 },
      { header: "Gjinia", width: 10 },
      { header: "Qyteti", width: 14 },
      { header: "Kurset", width: 30 },
      { header: "Gjendja", width: 13 },
      { header: "Klasa (mori pjesë / të mundshme)", width: 18 },
      { header: "Krijuar më", width: 12 },
      { header: "Shënime", width: 40 },
    ],
    students.map((st) => {
      const p = attended.get(st.id);
      return [
        st.name,
        st.email,
        st.profile?.phone ?? null,
        st.profile?.birthDate ? day(fromDbDate(st.profile.birthDate)) : null,
        st.profile?.gender ? s.genders[st.profile.gender] : null,
        st.profile?.city ?? null,
        st.courseMemberships.map((m) => m.course.title).join(", ") || null,
        st.banned ? admin.students.status.inactive : admin.students.status.active,
        p ? `${p.came} / ${p.available}` : null,
        day(toZonedInputValue(st.createdAt).slice(0, 10)),
        st.profile?.notes ?? null,
      ];
    }),
  );

  addSheet(
    workbook,
    "Pagesat",
    [
      { header: "Data", width: 12 },
      { header: "Studenti", width: 26 },
      { header: "Email", width: 30 },
      { header: "Kursi", width: 26 },
      { header: "Muaj", width: 7 },
      { header: "Shuma (€)", width: 11 },
      { header: "Mënyra", width: 20 },
      { header: "Shënim", width: 30 },
      { header: "Regjistroi", width: 20 },
      { header: "Anuluar", width: 30 },
    ],
    payments.map((p) => [
      day(fromDbDate(p.paidOn)),
      p.user.name,
      p.user.email,
      p.course.title,
      p.months,
      p.amountCents / 100,
      methods[p.method],
      p.note,
      p.recordedBy?.name ?? null,
      p.cancelledAt ? `${dateTime(p.cancelledAt)}${p.cancelReason ? `: ${p.cancelReason}` : ""}` : null,
    ]),
  );

  addSheet(
    workbook,
    "Pjesëmarrja",
    [
      { header: "Data", width: 17 },
      { header: "Mësimi", width: 30 },
      { header: "Kursi", width: 24 },
      { header: "Studenti", width: 26 },
      { header: "Email", width: 30 },
      { header: "Mori pjesë", width: 11 },
      { header: "Minuta", width: 8 },
    ],
    classes
      .toSorted((a, b) => a.scheduledStartAt.getTime() - b.scheduledStartAt.getTime())
      .slice(0, MAX_ROWS)
      .map((c) => [
        dateTime(c.scheduledStartAt),
        c.title,
        c.courseTitle,
        nameOf.get(c.userId)?.name ?? null,
        nameOf.get(c.userId)?.email ?? null,
        c.attended ? "Po" : "Jo",
        c.attended ? c.minutes : null,
      ]),
  );

  return { file: await workbook.xlsx.writeBuffer(), filename: `akademia-eksport-${todayInAcademy(now)}.xlsx` };
}
