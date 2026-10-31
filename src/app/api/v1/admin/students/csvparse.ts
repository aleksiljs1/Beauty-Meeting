import "server-only";
import ExcelJS from "exceljs";
import { studentProfileSchema, type StudentProfileInput } from "@/lib/student-profile";

export const MAX_IMPORT_STUDENTS = 100;
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_NOTE_LENGTH = 100;

export type StudentImportRow = {
  emri: string;
  email: string;
  abonimi: string[];
  profile: StudentProfileInput;
};

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cellText(value: ExcelJS.CellValue, formattedText: string) {
  if (value instanceof Date) return `${String(value.getUTCDate()).padStart(2, "0")}/${String(value.getUTCMonth() + 1).padStart(2, "0")}/${value.getUTCFullYear()}`;
  if (typeof value === "number") return formattedText.trim();
  if (typeof value === "object" && value !== null) return formattedText.trim();
  return String(value ?? "").trim();
}

function importDate(value: string) {
  const match = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(value.trim());
  if (!match) return value;
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

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

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  for (let column = 1; column <= headerRow.cellCount; column += 1) {
    headers.push(normalizeHeader(headerRow.getCell(column).text));
  }

  const aliases = new Map([
    ["emrat", "emrat"], ["emri", "emrat"], ["name", "emrat"], ["student name", "emrat"], ["full name", "emrat"],
    ["email", "email"],
    ["abonimet", "abonimet"], ["abonimi", "abonimet"], ["subscription", "abonimet"], ["subscriptions", "abonimet"], ["course", "abonimet"], ["courses", "abonimet"],
    ["telefoni", "phone"], ["telefon", "phone"], ["phone", "phone"], ["phone number", "phone"], ["phone no", "phone"], ["mobile", "phone"], ["mobile number", "phone"],
    ["datelindja", "birthDate"], ["datelindje", "birthDate"], ["ditelindja", "birthDate"], ["ditelindje", "birthDate"], ["birth date", "birthDate"], ["date of birth", "birthDate"], ["birthdate", "birthDate"], ["dob", "birthDate"],
    ["gjinia", "gender"], ["gender", "gender"], ["sex", "gender"],
    ["qyteti", "city"], ["city", "city"], ["city name", "city"],
    ["shenime", "notes"], ["notes", "notes"], ["admin notes", "notes"], ["administrator notes", "notes"],
  ]);
  const mappedHeaders = headers.map((header) => aliases.get(header) ?? header);
  const required = ["emrat", "email", "abonimet"];
  const supported = [...required, "phone", "birthDate", "gender", "city", "notes"];
  const missing = required.filter((header) => !mappedHeaders.includes(header));
  const unknown = mappedHeaders.filter((header) => header && !supported.includes(header));
  const duplicate = supported.filter((header) => mappedHeaders.filter((item) => item === header).length > 1);

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
    phone: mappedHeaders.indexOf("phone") + 1,
    birthDate: mappedHeaders.indexOf("birthDate") + 1,
    gender: mappedHeaders.indexOf("gender") + 1,
    city: mappedHeaders.indexOf("city") + 1,
    notes: mappedHeaders.indexOf("notes") + 1,
  };
  const students: StudentImportRow[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const read = (column: number) => {
      if (!column) return "";
      const cell = row.getCell(column);
      return cellText(cell.value, cell.text);
    };
    const emri = read(columns.emrat);
    const email = read(columns.email).toLowerCase();
    const abonimetText = read(columns.abonimet);
    const rawGender = read(columns.gender).toLocaleLowerCase();
    const gender = rawGender ? ({ female: "FEMALE", f: "FEMALE", woman: "FEMALE", femër: "FEMALE", femer: "FEMALE", male: "MALE", m: "MALE", man: "MALE", mashkull: "MALE", other: "OTHER", tjetër: "OTHER", tjeter: "OTHER" } as Record<string, string>)[rawGender] ?? rawGender.toUpperCase() : "";
    const profile = {
      phone: read(columns.phone),
      birthDate: importDate(read(columns.birthDate)),
      gender,
      city: read(columns.city),
      notes: read(columns.notes),
    };
    if (!emri && !email && !abonimetText && !Object.values(profile).some(Boolean)) return;

    if (emri.length < 2 || emri.length > 100) {
      throw new Error(`Rreshti ${rowNumber}: Emrat duhet të kenë 2 deri në 100 karaktere.`);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
      throw new Error(`Rreshti ${rowNumber}: Email mungon ose nuk është i vlefshëm.`);
    }

    const parsedProfile = studentProfileSchema.safeParse(profile);
    if (!parsedProfile.success) {
      const firstIssue = parsedProfile.error.issues[0];
      const fieldNames: Record<string, string> = { phone: "Telefoni", birthDate: "Datëlindja", gender: "Gjinia", city: "Qyteti", notes: "Shënime" };
      throw new Error(`Rreshti ${rowNumber}: ${fieldNames[String(firstIssue.path[0])] ?? "Profili"}: ${firstIssue.message}`);
    }
    if (parsedProfile.data.notes.length > MAX_IMPORT_NOTE_LENGTH) {
      throw new Error(`Rreshti ${rowNumber}: Shënimet mund të kenë maksimumi ${MAX_IMPORT_NOTE_LENGTH} karaktere.`);
    }

    students.push({
      emri,
      email,
      abonimi: abonimetText ? abonimetText.split(/[;,]/).map((value) => value.trim()).filter(Boolean) : [],
      profile: parsedProfile.data,
    });
    if (students.length > MAX_IMPORT_STUDENTS) {
      throw new Error(`Dokumenti mund të përmbajë maksimumi ${MAX_IMPORT_STUDENTS} studentë.`);
    }
  });

  if (!students.length) throw new Error("Dokumenti nuk përmban rreshta studentësh.");
  return students;
}
