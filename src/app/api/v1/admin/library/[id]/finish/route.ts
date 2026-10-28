import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { finishFileUpload } from "@/server/services/material-files";
import { finishMaterialSchema, uuidParam } from "@/server/validation/admin";

/**
 * Step 2: completes a multipart (video) upload when `parts` are sent, then verifies size and
 * real file type; only then the file becomes READY. Single-PUT uploads send no body.
 */
export const POST = route<RouteContext<"/api/v1/admin/library/[id]/finish">>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = uuidParam((await params).id, "Materiali nuk u gjet.");
  const { parts } = finishMaterialSchema.parse(await readJson(request).catch(() => ({})));
  return ok(await finishFileUpload(admin, id, parts));
});
