import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { finishMaterialUpload } from "@/server/services/materials";
import { uuidParam } from "@/server/validation/admin";

/** Step 2: verifies size and real file type; only then the material becomes READY. */
export const POST = route<RouteContext<"/api/v1/admin/materials/[id]/finish">>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  return ok(await finishMaterialUpload(admin, uuidParam((await params).id, "Materiali nuk u gjet.")));
});
