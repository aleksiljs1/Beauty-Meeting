import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { uuidParam } from "@/server/validation/admin";
import { createZoomHostAuthorization } from "@/server/zoom/meetings";

type Ctx = RouteContext<"/api/v1/admin/lessons/[id]/host-authorization">;

/**
 * Issues temporary Zoom host authorization to an authenticated admin.
 * Never accepts a meeting number or host identity from the browser.
 */
export const POST = route<Ctx>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = uuidParam((await params).id, "Mesimi nuk u gjet.");

  const hostConfig = await createZoomHostAuthorization(id, admin);

  return ok(hostConfig, { status: 200 });
});
