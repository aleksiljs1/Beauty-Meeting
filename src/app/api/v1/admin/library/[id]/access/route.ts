import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { previewFile } from "@/server/services/materials";
import { uuidParam } from "@/server/validation/admin";

/** Short-lived preview URL of a library file, for the administrator. */
export const POST = route<RouteContext<"/api/v1/admin/library/[id]/access">>(async (request, { params }) => {
  await requireApiUser(request, "admin");
  return ok(await previewFile(uuidParam((await params).id, "Materiali nuk u gjet.")));
});
