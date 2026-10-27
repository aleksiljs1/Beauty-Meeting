import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { enrollStudents, listCourseCandidates } from "@/server/services/course-members";
import { enrollStudentsSchema, uuidParam } from "@/server/validation/admin";

type Ctx = RouteContext<"/api/v1/admin/lessons/[id]/course-students">;

/** The lesson course's students who aren't enrolled yet (or whose access was revoked). */
export const GET = route<Ctx>(async (request, { params }) => {
  await requireApiUser(request, "admin");
  const id = uuidParam((await params).id, "Mësimi nuk u gjet.");
  return ok(await listCourseCandidates(id));
});

/** Adds the chosen students in one step. */
export const POST = route<Ctx>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = uuidParam((await params).id, "Mësimi nuk u gjet.");
  const input = enrollStudentsSchema.parse(await readJson(request));
  return ok(await enrollStudents(id, input.userIds, admin, { restoreRevoked: input.restoreRevoked ?? false }));
});
