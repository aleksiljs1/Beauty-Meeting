import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { setSeriesPublication } from "@/server/services/lesson-series";
import { seriesPublicationSchema, uuidParam } from "@/server/validation/admin";
import { zoomText } from "@/i18n/zoom";

/** Publishes the upcoming drafts, or cancels all upcoming dates. */
export const POST = route<RouteContext<"/api/v1/admin/series/[id]/publication">>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = uuidParam((await params).id, "Seria nuk u gjet.");
  const { publication } = seriesPublicationSchema.parse(await readJson(request));
  const { count, zoomDeleted } = await setSeriesPublication(id, publication, admin);
  return ok({ count, zoomWarning: zoomDeleted ? null : zoomText.warnings.deleteFailed });
});
