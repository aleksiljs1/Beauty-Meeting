import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser, resetDatabase } from "@/test/fixtures";

const content = await import("./content");
const publicQueries = await import("@/server/queries/public");
const { prisma } = await import("@/server/db");
const { headObject } = await import("@/server/storage/storage");
const { openGalleryObject } = await import("@/server/storage/public-media");

// 2×3 PNG header (IHDR) followed by filler; enough for type sniffing and dimension reading.
const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 3, 8, 6, 0, 0, 0, ...new Uint8Array(32),
]);

let admin: Awaited<ReturnType<typeof createUser>>;

beforeEach(async () => {
  await resetDatabase();
  await prisma.galleryItem.deleteMany();
  await prisma.service.deleteMany();
  admin = await createUser("admin");
});

async function upload(bytes: Uint8Array<ArrayBuffer>, filename = "foto.png", mimeType = "image/png") {
  const grant = await content.startGalleryUpload({ filename, mimeType, sizeBytes: bytes.byteLength });
  expect(grant.uploadKey).toMatch(/^gallery\//);
  const put = await fetch(grant.uploadUrl, { method: "PUT", body: bytes, headers: grant.headers });
  expect(put.ok).toBe(true);
  return grant.uploadKey;
}

const galleryOnly = { showInGallery: true, showOnHomeHero: false, showOnHomeGallery: false, showOnAbout: false };

describe("gallery uploads", () => {
  it("verifies the stored image, records its size and serves it only through gallery keys", async () => {
    const uploadKey = await upload(png);
    const item = await content.createGalleryItem(admin, { uploadKey, mimeType: "image/png", sizeBytes: png.byteLength, alt: "Manikyr", caption: "", isPublished: true, ...galleryOnly });
    expect(item).toMatchObject({ alt: "Manikyr", caption: null, width: 2, height: 3, isPublished: true });
    expect(item).not.toHaveProperty("imageKey");

    const object = await openGalleryObject(uploadKey);
    expect(object?.contentType).toBe("image/png");
    await object?.body.cancel();
    expect(await openGalleryObject("materials/x/y")).toBeNull();

    await content.deleteGalleryItem(admin, item.id);
    expect(await headObject(uploadKey)).toBeNull();
  });

  it("keeps display choices independent and assigns one image to single-image slots", async () => {
    const firstKey = await upload(png);
    const first = await content.createGalleryItem(admin, {
      uploadKey: firstKey,
      mimeType: "image/png",
      sizeBytes: png.byteLength,
      alt: "Foto e parë",
      caption: "",
      isPublished: true,
      showInGallery: true,
      showOnHomeHero: false,
      showOnHomeGallery: true,
      showOnAbout: true,
    });

    const secondKey = await upload(png);
    const second = await content.createGalleryItem(admin, {
      uploadKey: secondKey,
      mimeType: "image/png",
      sizeBytes: png.byteLength,
      alt: "Foto e dytë",
      caption: "",
      isPublished: true,
      showInGallery: false,
      showOnHomeHero: true,
      showOnHomeGallery: false,
      showOnAbout: true,
    });

    expect(await prisma.galleryItem.findUnique({ where: { id: first.id } })).toMatchObject({
      showInGallery: true,
      showOnHomeHero: false,
      showOnHomeGallery: true,
      showOnAbout: false,
    });
    expect(await prisma.galleryItem.findUnique({ where: { id: second.id } })).toMatchObject({
      showInGallery: false,
      showOnHomeHero: true,
      showOnHomeGallery: false,
      showOnAbout: true,
    });

    const gallery = await publicQueries.queryPublicGallery(100, "showInGallery");
    const homeHero = await publicQueries.queryPublicGallery(100, "showOnHomeHero");
    const homeGallery = await publicQueries.queryPublicGallery(100, "showOnHomeGallery");
    const about = await publicQueries.queryPublicGallery(100, "showOnAbout");
    expect(gallery.map(({ id }) => id)).toContain(first.id);
    expect(gallery.map(({ id }) => id)).not.toContain(second.id);
    expect(homeHero.map(({ id }) => id)).toContain(second.id);
    expect(homeHero.map(({ id }) => id)).not.toContain(first.id);
    expect(homeGallery.map(({ id }) => id)).toContain(first.id);
    expect(homeGallery.map(({ id }) => id)).not.toContain(second.id);
    expect(about.map(({ id }) => id)).toContain(second.id);
    expect(about.map(({ id }) => id)).not.toContain(first.id);

    await content.updateGalleryItem(admin, first.id, { showInGallery: false, showOnAbout: true });
    expect(await prisma.galleryItem.findUnique({ where: { id: first.id } })).toMatchObject({ showInGallery: false, showOnAbout: true });
    expect(await prisma.galleryItem.findUnique({ where: { id: second.id } })).toMatchObject({ showOnAbout: false, showOnHomeHero: true });
  });

  it("rejects bytes that are not the declared image and removes the object", async () => {
    const fake = new TextEncoder().encode("<svg onload=alert(1)>not really a png</svg>");
    const uploadKey = await upload(fake);
    await expect(
      content.createGalleryItem(admin, { uploadKey, mimeType: "image/png", sizeBytes: fake.byteLength, alt: "x", caption: "", isPublished: true, ...galleryOnly }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(await headObject(uploadKey)).toBeNull();
    expect(await prisma.galleryItem.count()).toBe(0);
  });

  it("refuses non-gallery keys and disallowed types", async () => {
    await expect(
      content.createGalleryItem(admin, { uploadKey: "materials/a/b", mimeType: "image/png", sizeBytes: 10, alt: "x", caption: "", isPublished: true, ...galleryOnly }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(content.startGalleryUpload({ filename: "x.svg", mimeType: "image/svg+xml", sizeBytes: 10 })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });
});

describe("ordering", () => {
  it("saves a complete order and rejects stale lists", async () => {
    const a = await content.createService(admin, { title: "A", description: "", priceText: "", isPublished: true });
    const b = await content.createService(admin, { title: "B", description: "", priceText: "", isPublished: true });
    await content.reorderServices(admin, [b.id, a.id]);
    expect((await content.listServicesForAdmin()).map((s) => s.title)).toEqual(["B", "A"]);
    await expect(content.reorderServices(admin, [a.id])).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
