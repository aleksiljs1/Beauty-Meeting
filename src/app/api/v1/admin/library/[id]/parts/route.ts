import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { presignFileParts } from "@/server/services/material-files";
import { presignPartsSchema, uuidParam } from "@/server/validation/admin";

/** Part URLs for a multipart (video) upload, requested in batches as it progresses. */
export const POST = route<RouteContext<"/api/v1/admin/library/[id]/parts">>(async (request, { params }) => {
  await requireApiUser(request, "admin");
  const id = uuidParam((await params).id, "Materiali nuk u gjet.");
  const { partNumbers } = presignPartsSchema.parse(await readJson(request));
  return ok(await presignFileParts(id, partNumbers));
});
