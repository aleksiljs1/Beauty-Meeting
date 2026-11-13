import { z } from "zod";
import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { prisma } from "@/server/db";
import { createAccount, sendAccountSetupEmail } from "@/server/services/accounts";
import { audit } from "@/server/services/audit";
import { setStudentCourses } from "@/server/services/course-members";
import { MAX_IMPORT_NOTE_LENGTH, MAX_IMPORT_STUDENTS } from "@/app/api/v1/admin/students/csvparse";
import { studentProfileSchema } from "@/lib/student-profile";
import { saveImportedStudentProfile } from "@/server/services/students";

const nullableOptional = <T extends z.ZodType>(schema: T) => schema.nullable().optional();
const importProfileSchema = z.object({
  phone: nullableOptional(studentProfileSchema.shape.phone),
  birthDate: nullableOptional(studentProfileSchema.shape.birthDate),
  gender: nullableOptional(studentProfileSchema.shape.gender),
  city: nullableOptional(studentProfileSchema.shape.city),
  notes: nullableOptional(studentProfileSchema.shape.notes.max(MAX_IMPORT_NOTE_LENGTH, `Shënimet mund të kenë maksimumi ${MAX_IMPORT_NOTE_LENGTH} karaktere.`)),
});

const importSchema = z.object({
  students: z.array(z.unknown()).min(1).max(MAX_IMPORT_STUDENTS),
  addToUpcoming: z.boolean().default(true),
});

const importStudentSchema = z.object({
  rowNumber: z.number().int().positive().optional(),
  emri: z.string().trim().min(2).max(100),
  email: z.email().trim().toLowerCase().max(200),
  abonimi: z.array(z.string().trim().min(1).max(200)).max(50),
  profile: importProfileSchema.nullable().optional(),
});

const FIELD_LABELS: Record<string, string> = {
  emri: "Emrat", email: "Email", abonimi: "Abonimet", phone: "Telefoni",
  birthDate: "Datëlindja", gender: "Gjinia", city: "Qyteti", notes: "Shënime",
};

function fieldForPath(path: PropertyKey[]) {
  const pathText = path.map(String);
  return pathText[0] === "profile" ? pathText[1] ?? "profile" : pathText[0] ?? "profile";
}

function emailFrom(value: unknown) {
  if (typeof value !== "object" || value === null || !("email" in value)) return "";
  return String(value.email ?? "").trim().toLowerCase();
}

const INCOMPLETE_REASON = "Llogaria u krijua, por kurset ose të dhënat nuk u ruajtën. Plotësojini te studenti.";

function normalizeCourseName(value: string) {
  return value.trim().normalize("NFKC").toLowerCase();
}

export const POST = route(async (request) => {
  const admin = await requireApiUser(request, "admin");
  const input = importSchema.parse(await readJson(request));

  const courses = await prisma.course.findMany({ select: { id: true, title: true } });
  const courseByName = new Map(courses.map((course) => [normalizeCourseName(course.title), course]));
  const seenEmails = new Set<string>();
  const results: { row: number; email: string; status: "created" | "failed" | "skipped"; fields?: string[]; reason?: string; mailSent?: boolean; lessonsAdded?: number }[] = [];
  for (const [index, rawRow] of input.students.entries()) {
    const rowNumber = typeof rawRow === "object" && rawRow !== null && "rowNumber" in rawRow && typeof rawRow.rowNumber === "number" ? rawRow.rowNumber : index + 2;
    const email = emailFrom(rawRow);
    if (email && seenEmails.has(email)) {
      results.push({ row: rowNumber, email, status: "skipped", fields: ["email"], reason: "Emaili përsëritet në skedar." });
      continue;
    }
    if (email) seenEmails.add(email);
    const parsedRow = importStudentSchema.safeParse(rawRow);
    if (!parsedRow.success) {
      const fieldIssues = parsedRow.error.issues.map((issue) => {
        const field = fieldForPath(issue.path);
        return { field, message: `${FIELD_LABELS[field] ?? "Të dhënat"}: ${issue.message}` };
      });
      results.push({ row: rowNumber, email, status: "failed", fields: [...new Set(fieldIssues.map((issue) => issue.field))], reason: fieldIssues.map((issue) => issue.message).join(" ") });
      continue;
    }
    const row = parsedRow.data;
    try {
      const existing = await prisma.user.findUnique({ where: { email: row.email }, select: { id: true } });
      if (existing) {
        results.push({ row: rowNumber, email: row.email, status: "skipped", fields: ["email"], reason: "Llogaria ekziston tashmë." });
        continue;
      }
      const rowUnmatched = row.abonimi.filter((name) => !courseByName.has(normalizeCourseName(name)));
      if (rowUnmatched.length) {
        results.push({ row: rowNumber, email: row.email, status: "failed", fields: ["abonimi"], reason: `Kurse të panjohura: ${rowUnmatched.join(", ")}.` });
        continue;
      }

      const student = await createAccount({ name: row.emri, email: row.email, role: "student" }, admin.id);
      // From here the account exists: a later failure must not leave it without a setup email
      // (a re-import would skip it as "already exists"), so report it and carry on.
      let lessonsAdded = 0;
      let incomplete: string | undefined;
      try {
        if (row.profile) await saveImportedStudentProfile(student.id, row.profile, admin);
        const courseIds = [...new Set(row.abonimi.map((name) => courseByName.get(normalizeCourseName(name))!.id))];
        if (courseIds.length) ({ lessonsAdded } = await setStudentCourses(student.id, courseIds, admin, { addToUpcoming: input.addToUpcoming }));
      } catch (error) {
        console.error("[students] import row created but not completed", rowNumber, error);
        incomplete = INCOMPLETE_REASON;
      }

      let mailSent = true;
      try {
        await sendAccountSetupEmail(student);
        await audit(admin.id, "account.setup_email", "user", student.id);
      } catch (error) {
        console.error("[mail] setup email failed during student import", student.id, error);
        mailSent = false;
      }
      results.push({ row: rowNumber, email: student.email, status: "created", mailSent, lessonsAdded, ...(incomplete && { reason: incomplete }) });
    } catch (error) {
      console.error("[students] import row failed", rowNumber, error);
      results.push({ row: rowNumber, email: row.email, status: "failed", reason: "Rreshti nuk mund të importohej." });
    }
  }

  return ok({ created: results.filter((result) => result.status === "created").length, results }, { status: 201 });
});
