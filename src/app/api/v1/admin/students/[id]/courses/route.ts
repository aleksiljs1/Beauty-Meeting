import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { setStudentCourses } from "@/server/services/course-members";
import { studentCoursesSchema, userIdParam } from "@/server/validation/admin";

/** Replaces the student's courses; optionally enrols them in the new courses' upcoming lessons. */
export const PUT = route<RouteContext<"/api/v1/admin/students/[id]/courses">>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = userIdParam((await params).id);
  const input = studentCoursesSchema.parse(await readJson(request));
  return ok(await setStudentCourses(id, input.courseIds, admin, { addToUpcoming: input.addToUpcoming ?? false }));
});
