import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { listMaterials, startMaterialUpload } from "@/server/services/materials";
import { startUploadSchema, uuidParam } from "@/server/validation/admin";

type Ctx = RouteContext<"/api/v1/admin/lessons/[id]/materials">;

export const GET = route<Ctx>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  return ok(await listMaterials(admin, uuidParam((await params).id, "Mësimi nuk u gjet.")));
});

/** Step 1 of an upload: returns a presigned PUT (to be called by the browser with `headers`). */
export const POST = route<Ctx>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const lessonId = uuidParam((await params).id, "Mësimi nuk u gjet.");
  const file = startUploadSchema.parse(await readJson(request));
  return ok(await startMaterialUpload(admin, lessonId, file), { status: 201 });
});
