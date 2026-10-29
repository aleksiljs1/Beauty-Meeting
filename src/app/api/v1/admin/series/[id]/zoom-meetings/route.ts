import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { createSeriesZoomMeetings } from "@/server/services/lesson-series";
import { uuidParam } from "@/server/validation/admin";

/** Creates the Zoom meetings of the upcoming dates that don't have one yet. */
export const POST = route<RouteContext<"/api/v1/admin/series/[id]/zoom-meetings">>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  return ok(await createSeriesZoomMeetings(uuidParam((await params).id, "Seria nuk u gjet."), admin));
});
