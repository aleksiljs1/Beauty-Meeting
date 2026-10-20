import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { moveMaterial, renameMaterial } from "@/server/services/material-admin";
import { deleteMaterial } from "@/server/services/materials";
import { updateMaterialSchema, uuidParam } from "@/server/validation/admin";

type Ctx = RouteContext<"/api/v1/admin/materials/[id]">;

export const PATCH = route<Ctx>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = uuidParam((await params).id, "Materiali nuk u gjet.");
  const input = updateMaterialSchema.parse(await readJson(request));
  if (input.displayName !== undefined) await renameMaterial(id, input.displayName, admin);
  if (input.move) await moveMaterial(id, input.move, admin);
  return ok({ id });
});

export const DELETE = route<Ctx>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  await deleteMaterial(admin, uuidParam((await params).id, "Materiali nuk u gjet."));
  return ok({ deleted: true });
});
