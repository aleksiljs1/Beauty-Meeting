import "server-only";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/server/env";

/**
 * Private S3-compatible storage (SeaweedFS locally, R2/S3 in production).
 * The bucket is never public: every read or write goes through a short-lived presigned URL
 * issued after an authorization check. We store object keys, never URLs.
 */
export const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  // The SDK otherwise signs a CRC32 of an empty body into presigned PUT URLs, which
  // S3-compatible providers (SeaweedFS, R2) reject once the real file is uploaded.
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

const Bucket = env.S3_BUCKET;

/** Upload URLs live slightly longer than read grants so slow connections can start the PUT. */
export const UPLOAD_URL_TTL_SECONDS = 10 * 60;
/** Read grants: at most a minute (and never beyond the student's access deadline). */
export const READ_URL_MAX_TTL_SECONDS = 60;

/** Non-guessable key; never derived from user input. */
export function newObjectKey(prefix: "materials" | "recordings" | "gallery", scopeId?: string) {
  const id = crypto.randomUUID();
  return scopeId ? `${prefix}/${scopeId}/${id}` : `${prefix}/${id}`;
}

export async function presignPut(params: { key: string; contentType: string; contentLength: number }) {
  // ContentLength and ContentType are part of the signature, so the client can't swap them.
  const command = new PutObjectCommand({
    Bucket,
    Key: params.key,
    ContentType: params.contentType,
    ContentLength: params.contentLength,
  });
  return getSignedUrl(s3, command, { expiresIn: UPLOAD_URL_TTL_SECONDS, signableHeaders: new Set(["content-type"]) });
}

export async function presignGet(params: {
  key: string;
  expiresIn: number;
  /** Only video playback may exceed the default 60 s cap (see recordings.ts). */
  maxTtlSeconds?: number;
  contentType: string;
  filename: string;
  disposition: "inline" | "attachment";
}) {
  const encoded = encodeURIComponent(params.filename);
  const command = new GetObjectCommand({
    Bucket,
    Key: params.key,
    ResponseContentType: params.contentType,
    ResponseContentDisposition: `${params.disposition}; filename*=UTF-8''${encoded}`,
    ResponseCacheControl: "private, no-store",
  });
  return getSignedUrl(s3, command, { expiresIn: Math.min(params.expiresIn, params.maxTtlSeconds ?? READ_URL_MAX_TTL_SECONDS) });
}

export async function headObject(key: string): Promise<{ size: number; contentType?: string } | null> {
  try {
    const result = await s3.send(new HeadObjectCommand({ Bucket, Key: key }));
    return { size: result.ContentLength ?? 0, contentType: result.ContentType };
  } catch (error) {
    if (error instanceof NotFound || (error as { name?: string }).name === "NotFound") return null;
    throw error;
  }
}

/** Reads only the first bytes of an object (for content sniffing), never the whole file. */
export async function readObjectHead(key: string, bytes: number): Promise<Uint8Array> {
  const result = await s3.send(new GetObjectCommand({ Bucket, Key: key, Range: `bytes=0-${bytes - 1}` }));
  return result.Body ? await result.Body.transformToByteArray() : new Uint8Array();
}

export async function deleteObject(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket, Key: key }));
}

// --- Multipart (large recordings) -------------------------------------------------------

export const MULTIPART_PART_BYTES = 64 * 1024 * 1024;

export async function startMultipart(key: string, contentType: string): Promise<string> {
  const result = await s3.send(new CreateMultipartUploadCommand({ Bucket, Key: key, ContentType: contentType }));
  if (!result.UploadId) throw new Error("Storage did not return an upload id");
  return result.UploadId;
}

export async function presignPart(key: string, uploadId: string, partNumber: number) {
  const command = new UploadPartCommand({ Bucket, Key: key, UploadId: uploadId, PartNumber: partNumber });
  return getSignedUrl(s3, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
}

export async function completeMultipart(key: string, uploadId: string, parts: { partNumber: number; etag: string }[]) {
  await s3.send(
    new CompleteMultipartUploadCommand({
      Bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: [...parts].sort((a, b) => a.partNumber - b.partNumber).map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    }),
  );
}

export async function abortMultipart(key: string, uploadId: string) {
  await s3.send(new AbortMultipartUploadCommand({ Bucket, Key: key, UploadId: uploadId }));
}
