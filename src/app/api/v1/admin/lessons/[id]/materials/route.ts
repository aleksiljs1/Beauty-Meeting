import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { attachFiles, listMaterials } from "@/server/services/materials";
import { attachFilesSchema, uuidParam } from "@/server/validation/admin";

type Ctx = RouteContext<"/api/v1/admin/lessons/[id]/materials">;

export const GET = route<Ctx>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  return ok(await listMaterials(admin, uuidParam((await params).id, "Mësimi nuk u gjet.")));
});

/** Adds files from the library to the lesson (new uploads go through /admin/library with `lessonId`). */
export const POST = route<Ctx>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const lessonId = uuidParam((await params).id, "Mësimi nuk u gjet.");
  const { fileIds } = attachFilesSchema.parse(await readJson(request));
  await attachFiles(admin, lessonId, fileIds);
  return ok({ attached: fileIds.length }, { status: 201 });
});
