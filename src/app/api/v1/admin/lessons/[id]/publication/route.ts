import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { requireAdminLesson } from "@/server/queries/admin";
import { setLessonPublication } from "@/server/services/lessons";
import { publicationSchema, uuidParam } from "@/server/validation/admin";

export const POST = route<RouteContext<"/api/v1/admin/lessons/[id]/publication">>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = uuidParam((await params).id, "Mësimi nuk u gjet.");
  const { publication } = publicationSchema.parse(await readJson(request));
  await setLessonPublication(id, publication, admin);
  return ok(await requireAdminLesson(id));
});
