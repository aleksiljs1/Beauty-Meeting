import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { listCourseStudents } from "@/server/services/course-members";
import { uuidParam } from "@/server/validation/admin";

/** Active students of a course — pre-selected when creating a lesson in that course. */
export const GET = route<RouteContext<"/api/v1/admin/courses/[id]/students">>(async (request, { params }) => {
  await requireApiUser(request, "admin");
  const id = uuidParam((await params).id, "Kursi nuk u gjet.");
  return ok(await listCourseStudents(id));
});
