import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { uuidParam } from "@/server/validation/admin";
import { createZoomHostAppStart } from "@/server/zoom/host";

/** Fresh Zoom start link for the host to open the meeting in the Zoom desktop app. Admin only. */
export const POST = route<RouteContext<"/api/v1/admin/lessons/[id]/host-app-start">>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = uuidParam((await params).id, "Mësimi nuk u gjet.");
  return ok(await createZoomHostAppStart(id, admin));
});
