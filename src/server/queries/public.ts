import "server-only";
import { unstable_cache } from "next/cache";
import { common } from "@/i18n/common";
import { parseOpeningHours, type OpeningHoursRow } from "@/lib/public-content";
import { prisma } from "@/server/db";

/**
 * Read-only queries for the public website.
 *
 * Caching (Next 16 without Cache Components): public pages use no request-time APIs, so they
 * are prerendered and served from the full-route cache. The data below is additionally kept in
 * the Data Cache via `unstable_cache` under one tag. Every admin content change calls
 * `revalidatePublicContent()` (src/server/services/content.ts), which expires the tag and the
 * public paths, so the next visit renders fresh content once and caches it again.
 *
 * Values must be JSON-serializable (no Date/BigInt): unstable_cache stores JSON.
 */

export const PUBLIC_CONTENT_TAG = "public-content";

const cached = <Args extends unknown[], R>(fn: (...args: Args) => Promise<R>, key: string) =>
  unstable_cache(fn, ["public", key], { tags: [PUBLIC_CONTENT_TAG] });

export type PublicSettings = {
  name: string;
  tagline: string | null;
  about: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  mapUrl: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  openingHours: OpeningHoursRow[];
};

const blank = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null);

export const getPublicSettings = cached(async (): Promise<PublicSettings> => {
  const row = await prisma.academySettings.findUnique({ where: { id: 1 } });
  return {
    name: blank(row?.name) ?? common.brandFallback,
    tagline: blank(row?.tagline),
    about: blank(row?.about),
    address: blank(row?.address),
    phone: blank(row?.phone),
    email: blank(row?.email),
    whatsapp: blank(row?.whatsapp),
    mapUrl: blank(row?.mapUrl),
    instagramUrl: blank(row?.instagramUrl),
    facebookUrl: blank(row?.facebookUrl),
    openingHours: parseOpeningHours(row?.openingHours),
  };
}, "settings");

export type PublicService = { id: string; title: string; description: string | null; priceText: string | null };

export const getPublicServices = cached(
  async (): Promise<PublicService[]> =>
    prisma.service.findMany({
      where: { isPublished: true },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true, title: true, description: true, priceText: true },
      take: 100,
    }),
  "services",
);

export type PublicCourse = {
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  durationText: string | null;
  priceText: string | null;
};

const courseSelect = { slug: true, title: true, summary: true, description: true, durationText: true, priceText: true } as const;

export const getPublicCourses = cached(
  async (): Promise<PublicCourse[]> =>
    prisma.course.findMany({
      where: { isPublic: true },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: courseSelect,
      take: 100,
    }),
  "courses",
);

export const getPublicCourse = cached(
  async (slug: string): Promise<PublicCourse | null> =>
    prisma.course.findFirst({ where: { slug, isPublic: true }, select: courseSelect }),
  "course",
);

export type PublicGalleryItem = { id: string; src: string; alt: string; caption: string | null; width: number | null; height: number | null };

export const getPublicGallery = cached(async (limit?: number): Promise<PublicGalleryItem[]> => {
  const rows = await prisma.galleryItem.findMany({
    where: { isPublished: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, alt: true, caption: true, width: true, height: true },
    take: Math.min(limit ?? 200, 200),
  });
  // Only the id-based media route is exposed — never the storage key.
  return rows.map((row) => ({ ...row, src: galleryImageSrc(row.id) }));
}, "gallery");

export function galleryImageSrc(id: string) {
  return `/media/gallery/${id}`;
}
