import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { uuidParam } from "@/server/validation/admin";
import { createZoomHostAuthorization } from "@/server/zoom/host";

/** Temporary Zoom host authorization for an admin. Never accepts meeting data from the browser. */
export const POST = route<RouteContext<"/api/v1/admin/lessons/[id]/host-authorization">>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = uuidParam((await params).id, "Mësimi nuk u gjet.");
  return ok(await createZoomHostAuthorization(id, admin));
});
