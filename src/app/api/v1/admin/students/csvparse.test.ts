import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildStudentImportTemplate, parseStudentWorkbook } from "./csvparse";

/** The downloadable template, filled in the way an admin would. */
async function filledTemplate(rows: string[][]) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await buildStudentImportTemplate(["Manikyr", "Pedikyr"])) as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.getWorksheet("Studentët")!;
  rows.forEach((values, index) => {
    sheet.getRow(index + 2).values = values;
  });
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

describe("student import template", () => {
  it("reads back several students filled into the template", async () => {
    const students = await parseStudentWorkbook(
      await filledTemplate([
        ["Ana Hoxha", "Ana@Example.com", "Manikyr, Pedikyr", "+355 69 123 4567", "28/03/1998", "Femër", "Tiranë", "Paguan me këste"],
        ["Bora Kola", "bora@example.com", "", "", "", "", "", ""],
        ["Dea Leka", "dea@example.com", "Pedikyr", "", "5/1/2001", "Mashkull", "", ""],
      ]),
    );

    expect(students).toEqual([
      {
        rowNumber: 2,
        issues: [],
        emri: "Ana Hoxha",
        email: "ana@example.com",
        abonimi: ["Manikyr", "Pedikyr"],
        profile: { phone: "+355 69 123 4567", birthDate: "1998-03-28", gender: "FEMALE", city: "Tiranë", notes: "Paguan me këste" },
      },
      { rowNumber: 3, issues: [], emri: "Bora Kola", email: "bora@example.com", abonimi: [], profile: { phone: "", birthDate: "", gender: "", city: "", notes: "" } },
      {
        rowNumber: 4,
        issues: [],
        emri: "Dea Leka",
        email: "dea@example.com",
        abonimi: ["Pedikyr"],
        profile: { phone: "", birthDate: "2001-01-05", gender: "MALE", city: "", notes: "" },
      },
    ]);
  });

  it("rejects the template when no student was filled in", async () => {
    await expect(parseStudentWorkbook(await filledTemplate([]))).rejects.toThrow("nuk përmban rreshta");
  });
});
