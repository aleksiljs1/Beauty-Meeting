import { galleryCreateSchema } from "@/lib/content-schemas";
import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { createGalleryItem, listGalleryForAdmin, revalidatePublicContent } from "@/server/services/content";

export const GET = route(async (request) => {
  await requireApiUser(request, "admin");
  return ok(await listGalleryForAdmin());
});

/** Finish step of an upload: verifies the stored object and creates the gallery item. */
export const POST = route(async (request) => {
  const admin = await requireApiUser(request, "admin");
  const input = galleryCreateSchema.parse(await readJson(request));
  const item = await createGalleryItem(admin, input);
  revalidatePublicContent();
  return ok(item, { status: 201 });
});
