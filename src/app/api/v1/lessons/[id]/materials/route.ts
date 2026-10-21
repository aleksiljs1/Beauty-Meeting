import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { parseLessonId } from "@/server/queries/portal";
import { listMaterials } from "@/server/services/materials";

export const GET = route<RouteContext<"/api/v1/lessons/[id]/materials">>(async (request, { params }) => {
  const user = await requireApiUser(request);
  const lessonId = parseLessonId((await params).id);
  return ok(await listMaterials(user, lessonId));
});
