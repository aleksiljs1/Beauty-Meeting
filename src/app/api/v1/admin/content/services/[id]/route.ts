import { serviceSchema } from "@/lib/content-schemas";
import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { deleteService, parseContentId, revalidatePublicContent, updateService } from "@/server/services/content";

type Ctx = RouteContext<"/api/v1/admin/content/services/[id]">;

export const PATCH = route<Ctx>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = parseContentId((await params).id);
  const input = serviceSchema.partial().parse(await readJson(request));
  const updated = await updateService(admin, id, input);
  revalidatePublicContent();
  return ok(updated);
});

export const DELETE = route<Ctx>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = parseContentId((await params).id);
  await deleteService(admin, id);
  revalidatePublicContent();
  return ok({ id });
});
