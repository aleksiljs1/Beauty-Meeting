 import { z } from "zod";
import { requireApiUser } from "@/server/auth/session";
import { ApiError, ok, readJson, route } from "@/server/http";
import { prisma } from "@/server/db";
import { createAccount, sendAccountSetupEmail } from "@/server/services/accounts";
import { audit } from "@/server/services/audit";
import { setStudentCourses } from "@/server/services/course-members";
import { MAX_IMPORT_STUDENTS } from "@/app/api/v1/admin/students/csvparse";

const importSchema = z.object({
  students: z.array(z.object({
    emri: z.string().trim().min(2).max(100),
    email: z.email().trim().toLowerCase().max(200),
    abonimi: z.array(z.string().trim().min(1).max(200)).max(50),
  })).min(1).max(MAX_IMPORT_STUDENTS),
  addToUpcoming: z.boolean().default(true),
});

function normalizeCourseName(value: string) {
  return value.trim().normalize("NFKC").toLowerCase();
}

export const POST = route(async (request) => {
  const admin = await requireApiUser(request, "admin");
  const input = importSchema.parse(await readJson(request));

  const emails = input.students.map((student) => student.email);
  if (new Set(emails).size !== emails.length) {
    throw new ApiError("VALIDATION_FAILED", "Skedari ka adresa emaili të përsëritura.");
  }

  const courses = await prisma.course.findMany({ select: { id: true, title: true } });
  const courseByName = new Map(courses.map((course) => [normalizeCourseName(course.title), course]));
  const unmatched = [...new Set(input.students.flatMap((student) => student.abonimi))]
    .filter((name) => !courseByName.has(normalizeCourseName(name)));
  if (unmatched.length) {
    throw new ApiError("VALIDATION_FAILED", `Këto abonime nuk përputhen me kurset: ${unmatched.join(", " )}.`);
  }

  const existing = await prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } });
  if (existing.length) {
    throw new ApiError("CONFLICT", `Ekzistojnë tashmë llogari me emailin: ${existing.map((user) => user.email).join(", ")}.`);
  }

  const results: { email: string; mailSent: boolean; lessonsAdded: number }[] = [];
  for (const row of input.students) {
    const student = await createAccount({ name: row.emri, email: row.email, role: "student" }, admin.id);
    const courseIds = [...new Set(row.abonimi.map((name) => courseByName.get(normalizeCourseName(name))!.id))];
    const courseResult = courseIds.length
      ? await setStudentCourses(student.id, courseIds, admin, { addToUpcoming: input.addToUpcoming })
      : null;

    let mailSent = true;
    try {
      await sendAccountSetupEmail(student);
      await audit(admin.id, "account.setup_email", "user", student.id);
    } catch (error) {
      console.error("[mail] setup email failed during student import", student.id, error);
      mailSent = false;
    }
    results.push({ email: student.email, mailSent, lessonsAdded: courseResult?.lessonsAdded ?? 0 });
  }

  return ok({ created: results.length, results }, { status: 201 });
});
