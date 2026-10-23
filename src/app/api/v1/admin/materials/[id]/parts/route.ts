import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { presignMaterialParts } from "@/server/services/materials";
import { presignPartsSchema, uuidParam } from "@/server/validation/admin";

/** Part URLs for a multipart (video) material upload, requested in batches as it progresses. */
export const POST = route<RouteContext<"/api/v1/admin/materials/[id]/parts">>(async (request, { params }) => {
  await requireApiUser(request, "admin");
  const id = uuidParam((await params).id, "Materiali nuk u gjet.");
  const { partNumbers } = presignPartsSchema.parse(await readJson(request));
  return ok(await presignMaterialParts(id, partNumbers));
});
