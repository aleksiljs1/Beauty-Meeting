/** Shapes returned by /api/v1/admin/content/** (mirrors the selects in services/content.ts). */

export type AdminService = {
  id: string;
  title: string;
  description: string | null;
  priceText: string | null;
  isPublished: boolean;
  position: number;
};

export type AdminCourse = {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  description: string | null;
  durationText: string | null;
  priceText: string | null;
  isPublic: boolean;
  position: number;
  /** "YYYY-MM-DD" */
  startsOn: string | null;
  durationMonths: number | null;
  monthlyPriceCents: number | null;
};

export type AdminGalleryItem = {
  id: string;
  alt: string;
  caption: string | null;
  width: number | null;
  height: number | null;
  isPublished: boolean;
  position: number;
  showInGallery: boolean;
  showOnHomeHero: boolean;
  showOnHomeGallery: boolean;
  showOnAbout: boolean;
  previewSrc: string;
};
