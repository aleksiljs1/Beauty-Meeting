import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { deleteFile, renameFile } from "@/server/services/material-files";
import { renameFileSchema, uuidParam } from "@/server/validation/admin";

type Ctx = RouteContext<"/api/v1/admin/library/[id]">;

export const PATCH = route<Ctx>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = uuidParam((await params).id, "Materiali nuk u gjet.");
  const { displayName } = renameFileSchema.parse(await readJson(request));
  await renameFile(id, displayName, admin);
  return ok({ id });
});

/** Deletes the file from the library and from every lesson that uses it (also cancels an unfinished upload). */
export const DELETE = route<Ctx>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  await deleteFile(admin, uuidParam((await params).id, "Materiali nuk u gjet."));
  return ok({ deleted: true });
});
