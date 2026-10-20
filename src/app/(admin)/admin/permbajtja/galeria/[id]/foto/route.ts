import { getPageUser } from "@/server/auth/session";
import { galleryKeyForAdmin } from "@/server/services/content";
import { openGalleryObject } from "@/server/storage/public-media";

/**
 * Admin-only preview of a gallery image (including unpublished ones) for the content editor.
 * Read-only GET authorized by the session cookie, so a plain <img> can load it; never cached
 * by shared caches.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });

export async function GET(_request: Request, ctx: RouteContext<"/admin/permbajtja/galeria/[id]/foto">) {
  const user = await getPageUser();
  if (user?.role !== "admin") return notFound();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return notFound();
  const key = await galleryKeyForAdmin(id);
  const object = key ? await openGalleryObject(key) : null;
  if (!object) return notFound();
  return new Response(object.body, {
    headers: {
      "Content-Type": object.contentType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
