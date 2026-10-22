import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { requireAdminLesson } from "@/server/queries/admin";
import { setLessonPublication } from "@/server/services/lessons";
import { publicationSchema, uuidParam } from "@/server/validation/admin";
import { zoomText } from "@/i18n/zoom";

const ZOOM_DELETE_WARNING = zoomText.warnings.deleteFailed;

export const POST = route<RouteContext<"/api/v1/admin/lessons/[id]/publication">>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = uuidParam((await params).id, "Mësimi nuk u gjet.");
  const { publication } = publicationSchema.parse(await readJson(request));
  const { zoomDeleted } = await setLessonPublication(id, publication, admin);
  return ok({ ...(await requireAdminLesson(id)), zoomWarning: zoomDeleted ? null : ZOOM_DELETE_WARNING });
});
