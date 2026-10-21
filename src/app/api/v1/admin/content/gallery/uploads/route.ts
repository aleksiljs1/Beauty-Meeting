import { galleryUploadStartSchema } from "@/lib/content-schemas";
import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { startGalleryUpload } from "@/server/services/content";

export const POST = route(async (request) => {
  await requireApiUser(request, "admin");
  const input = galleryUploadStartSchema.parse(await readJson(request));
  return ok(await startGalleryUpload(input), { status: 201 });
});
