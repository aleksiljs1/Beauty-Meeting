import { galleryItemSchema } from "@/lib/content-schemas";
import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { deleteGalleryItem, parseContentId, revalidatePublicContent, updateGalleryItem } from "@/server/services/content";

type Ctx = RouteContext<"/api/v1/admin/content/gallery/[id]">;

export const PATCH = route<Ctx>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = parseContentId((await params).id);
  const input = galleryItemSchema.partial().parse(await readJson(request));
  const item = await updateGalleryItem(admin, id, input);
  revalidatePublicContent();
  return ok(item);
});

export const DELETE = route<Ctx>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = parseContentId((await params).id);
  await deleteGalleryItem(admin, id);
  revalidatePublicContent();
  return ok({ id });
});
