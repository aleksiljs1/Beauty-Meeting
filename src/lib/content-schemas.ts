import { z } from "zod";
import { adminContent } from "@/i18n/admin-content";
import { parseEuroCents } from "./billing";
import { SLUG_PATTERN } from "./public-content";

/**
 * Input schemas for public-content editing, shared by the admin forms (react-hook-form) and the
 * API route handlers. Optional text fields are plain strings; the server stores "" as null.
 */

const v = adminContent.validation;

const text = (max: number) => z.string().trim().max(max, v.tooLong);
const requiredText = (max: number) => text(max).min(1, v.required);
const wholeNumber = (max: number) => text(3).refine((value) => value === "" || (/^\d+$/.test(value) && Number(value) <= max), v.number(max));
const calendarDate = text(10).refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), v.date);
const euroAmount = text(12).refine((value) => value === "" || parseEuroCents(value) !== null, v.price);
const httpUrl = text(500).refine((value) => value === "" || /^https?:\/\/[^\s]+$/i.test(value), v.url);

export const openingHoursRowSchema = z.object({ days: text(80), hours: text(80) });

export const settingsSchema = z.object({
  name: requiredText(120),
  tagline: text(200),
  about: text(10_000),
  address: text(300),
  phone: text(60),
  email: text(200),
  whatsapp: text(60),
  mapUrl: httpUrl,
  instagramUrl: httpUrl,
  facebookUrl: httpUrl,
  openingHours: z.array(openingHoursRowSchema).max(14, v.tooManyRows),
});
export type SettingsInput = z.infer<typeof settingsSchema>;

export const serviceSchema = z.object({
  title: requiredText(120),
  description: text(2_000),
  priceText: text(80),
  isPublished: z.boolean(),
});
export type ServiceInput = z.infer<typeof serviceSchema>;

export const courseSchema = z.object({
  title: requiredText(160),
  slug: requiredText(80).regex(SLUG_PATTERN, v.slug),
  summary: text(500),
  description: text(10_000),
  durationText: text(80),
  priceText: text(80),
  isPublic: z.boolean(),
  /** Billing: empty fields mean "not set"; payments need a start date and a length. */
  startsOn: calendarDate,
  duration: z.object({ years: wholeNumber(10), months: wholeNumber(11) }),
  monthlyPrice: euroAmount,
});
export type CourseInput = z.infer<typeof courseSchema>;

export const orderSchema = z.object({ ids: z.array(z.uuid()).min(1).max(200) });

export const galleryUploadStartSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive(),
});

export const galleryVisibilityFields = ["showInGallery", "showOnHomeHero", "showOnHomeGallery", "showOnAbout"] as const;

export const galleryItemSchema = z.object({
  alt: requiredText(200),
  caption: text(300),
  isPublished: z.boolean(),
  showInGallery: z.boolean(),
  showOnHomeHero: z.boolean(),
  showOnHomeGallery: z.boolean(),
  showOnAbout: z.boolean(),
});
export type GalleryItemInput = z.infer<typeof galleryItemSchema>;
export type GalleryVisibilityField = (typeof galleryVisibilityFields)[number];

export const galleryCreateSchema = galleryItemSchema.extend({
  uploadKey: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive(),
});
