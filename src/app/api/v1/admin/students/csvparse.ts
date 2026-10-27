import "server-only";
import ExcelJS from "exceljs";

export const MAX_IMPORT_STUDENTS = 100;
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

export type StudentImportRow = {
  emri: string;
  email: string;
  abonimi: string[];
};

export async function parseStudentWorkbook(buffer: Uint8Array): Promise<StudentImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    const nodeBuffer = Buffer.from(buffer);
    await workbook.xlsx.load(nodeBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new Error("Skedari nuk mund të lexohet si dokument Excel.");
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Dokumenti Excel nuk ka fletë pune.");

  const normalizeHeader = (value: unknown) => String(value ?? "").trim().toLowerCase();
  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  for (let column = 1; column <= headerRow.cellCount; column += 1) {
    headers.push(normalizeHeader(headerRow.getCell(column).text));
  }

  const aliases = new Map([
    ["emrat", "emrat"],
    ["emri", "emrat"],
    ["email", "email"],
    ["abonimet", "abonimet"],
  ]);
  const mappedHeaders = headers.map((header) => aliases.get(header) ?? header);
  const required = ["emrat", "email", "abonimet"];
  const missing = required.filter((header) => !mappedHeaders.includes(header));
  const unknown = mappedHeaders.filter((header) => header && !required.includes(header));
  const duplicate = required.filter((header) => mappedHeaders.filter((item) => item === header).length > 1);

  if (missing.length || unknown.length || duplicate.length) {
    const messages = [
      missing.length ? `Mungojnë kolonat: ${missing.join(", ")}` : "",
      unknown.length ? `Kolona të papritura: ${unknown.join(", ")}` : "",
      duplicate.length ? `Kolona të përsëritura: ${duplicate.join(", ")}` : "",
    ].filter(Boolean);
    throw new Error(messages.join(". "));
  }

  const columns = {
    emrat: mappedHeaders.indexOf("emrat") + 1,
    email: mappedHeaders.indexOf("email") + 1,
    abonimet: mappedHeaders.indexOf("abonimet") + 1,
  };
  const students: StudentImportRow[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const emri = row.getCell(columns.emrat).text.trim();
    const email = row.getCell(columns.email).text.trim().toLowerCase();
    const abonimetText = row.getCell(columns.abonimet).text.trim();
    if (!emri && !email && !abonimetText) return;

    if (emri.length < 2 || emri.length > 100) {
      throw new Error(`Rreshti ${rowNumber}: Emrat duhet të kenë 2 deri në 100 karaktere.`);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
      throw new Error(`Rreshti ${rowNumber}: Email mungon ose nuk është i vlefshëm.`);
    }

    students.push({
      emri,
      email,
      abonimi: abonimetText ? abonimetText.split(/[;,]/).map((value) => value.trim()).filter(Boolean) : [],
    });
    if (students.length > MAX_IMPORT_STUDENTS) {
      throw new Error(`Dokumenti mund të përmbajë maksimumi ${MAX_IMPORT_STUDENTS} studentë.`);
    }
  });

  if (!students.length) throw new Error("Dokumenti nuk përmban rreshta studentësh.");
  return students;
}
