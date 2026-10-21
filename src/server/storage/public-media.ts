import "server-only";
import { GetObjectCommand, NoSuchKey } from "@aws-sdk/client-s3";
import { env } from "@/server/env";
import { s3 } from "./storage";

/**
 * Streams public website images (gallery) out of the private bucket through our own route.
 * Only keys of the form `gallery/<uuid>` can ever be read here, so lesson materials and
 * recordings are unreachable even if a wrong key were passed in.
 */

const GALLERY_KEY = /^gallery\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Content types the gallery accepts (verified by magic bytes at upload time). */
export const GALLERY_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function isGalleryKey(key: string): boolean {
  return GALLERY_KEY.test(key);
}

export async function openGalleryObject(
  key: string,
): Promise<{ body: ReadableStream; contentType: string; contentLength?: number } | null> {
  if (!isGalleryKey(key)) return null;
  try {
    const result = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    const contentType = result.ContentType ?? "";
    if (!result.Body || !(GALLERY_IMAGE_TYPES as readonly string[]).includes(contentType)) {
      result.Body?.transformToWebStream().cancel().catch(() => {});
      return null;
    }
    return { body: result.Body.transformToWebStream(), contentType, contentLength: result.ContentLength };
  } catch (error) {
    if (error instanceof NoSuchKey || (error as { name?: string }).name === "NoSuchKey") return null;
    throw error;
  }
}
