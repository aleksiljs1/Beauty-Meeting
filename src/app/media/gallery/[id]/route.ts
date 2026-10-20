import { prisma } from "@/server/db";
import { openGalleryObject } from "@/server/storage/public-media";

/**
 * Public gallery image: `/media/gallery/<GalleryItem.id>`. Only PUBLISHED items are served,
 * and only from `gallery/` storage keys. Each item id maps to one immutable upload (a new
 * image always gets a new id), so the response can be cached for a year.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound() {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=60", "Content-Type": "text/plain; charset=utf-8" } });
}

export async function GET(_request: Request, ctx: RouteContext<"/media/gallery/[id]">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return notFound();
  try {
    const item = await prisma.galleryItem.findFirst({ where: { id, isPublished: true }, select: { imageKey: true } });
    if (!item) return notFound();
    const object = await openGalleryObject(item.imageKey);
    if (!object) return notFound();
    const headers = new Headers({
      "Content-Type": object.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    });
    if (object.contentLength !== undefined) headers.set("Content-Length", String(object.contentLength));
    return new Response(object.body, { status: 200, headers });
  } catch (error) {
    console.error("[media] gallery image failed", id, error);
    return new Response("Error", { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
