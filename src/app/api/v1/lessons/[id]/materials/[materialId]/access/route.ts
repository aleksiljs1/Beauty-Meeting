import { z } from "zod";
import { requireApiUser } from "@/server/auth/session";
import { ApiError, ok, readJson, route } from "@/server/http";
import { parseLessonId } from "@/server/queries/portal";
import { grantMaterialAccess } from "@/server/services/materials";

const bodySchema = z.object({ mode: z.enum(["view", "download"]) });

/** Short-lived URL for one material, re-checked against the access policy every time. */
export const POST = route<RouteContext<"/api/v1/lessons/[id]/materials/[materialId]/access">>(async (request, { params }) => {
  const user = await requireApiUser(request);
  const { id, materialId } = await params;
  const lessonId = parseLessonId(id);
  const material = z.uuid().safeParse(materialId);
  if (!material.success) throw new ApiError("NOT_FOUND", "Materiali nuk u gjet.");
  const { mode } = bodySchema.parse(await readJson(request));
  return ok(await grantMaterialAccess(user, lessonId, material.data, mode));
});
