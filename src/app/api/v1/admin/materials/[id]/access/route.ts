import { requireApiUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { ApiError, ok, route } from "@/server/http";
import { grantMaterialAccess } from "@/server/services/materials";
import { uuidParam } from "@/server/validation/admin";

/** Short-lived preview URL for the administrator (same grant path as students). */
export const POST = route<RouteContext<"/api/v1/admin/materials/[id]/access">>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = uuidParam((await params).id, "Materiali nuk u gjet.");
  const material = await prisma.lessonMaterial.findUnique({ where: { id }, select: { lessonId: true } });
  if (!material) throw new ApiError("NOT_FOUND", "Materiali nuk u gjet.");
  return ok(await grantMaterialAccess(admin, material.lessonId, id, "view"));
});
