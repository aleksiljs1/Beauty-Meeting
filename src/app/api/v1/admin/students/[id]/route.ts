import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { renameStudent, setStudentActive } from "@/server/services/students";
import { updateStudentSchema, userIdParam } from "@/server/validation/admin";

export const PATCH = route<RouteContext<"/api/v1/admin/students/[id]">>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = userIdParam((await params).id);
  const input = updateStudentSchema.parse(await readJson(request));
  if (input.name !== undefined) await renameStudent(id, input.name, admin);
  if (input.active !== undefined) await setStudentActive(id, input.active, admin);
  return ok({ id });
});
