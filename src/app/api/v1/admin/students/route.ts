import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { listStudents } from "@/server/queries/admin";
import { createAccount, sendAccountSetupEmail } from "@/server/services/accounts";
import { audit } from "@/server/services/audit";
import { assertCoursesExist, setStudentCourses } from "@/server/services/course-members";
import { createStudentSchema, pageQuery } from "@/server/validation/admin";

export const GET = route(async (request) => {
  await requireApiUser(request, "admin");
  const url = new URL(request.url);
  return ok(await listStudents({ q: url.searchParams.get("q") ?? undefined, page: pageQuery(url.searchParams.get("page")) }));
});

/** Creates a student account (no password) and emails a single-use "set your password" link. */
export const POST = route(async (request) => {
  const admin = await requireApiUser(request, "admin");
  const input = createStudentSchema.parse(await readJson(request));
  const { courseIds = [], addToUpcoming = false, ...account } = input;
  await assertCoursesExist([...new Set(courseIds)]); // before the account exists, so a bad id leaves nothing behind
  const student = await createAccount({ ...account, role: "student" }, admin.id);
  const courses = courseIds.length ? await setStudentCourses(student.id, courseIds, admin, { addToUpcoming }) : null;
  let mailSent = true;
  try {
    await sendAccountSetupEmail(student);
    await audit(admin.id, "account.setup_email", "user", student.id);
  } catch (error) {
    // The account exists; the admin can resend from the list.
    console.error("[mail] setup email failed", student.id, error);
    mailSent = false;
  }
  return ok({ student, mailSent, lessonsAdded: courses?.lessonsAdded ?? 0 }, { status: 201 });
});
