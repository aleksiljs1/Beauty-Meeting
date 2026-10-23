"use client";

/**
 * Direct browser → storage uploads to presigned URLs. Deliberately plain XMLHttpRequest
 * (for upload progress), never the `api` Axios instance: our Bearer token must not be sent
 * to the storage host.
 */

export class UploadAbortedError extends Error {
  constructor() {
    super("Upload aborted");
    this.name = "UploadAbortedError";
  }
}

export function putToPresignedUrl(
  url: string,
  body: Blob,
  options: { headers?: Record<string, string>; onProgress?: (loaded: number) => void; signal?: AbortSignal } = {},
): Promise<{ etag: string | null }> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) return reject(new UploadAbortedError());
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(options.headers ?? {})) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => options.onProgress?.(event.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve({ etag: xhr.getResponseHeader("ETag") });
      else reject(new Error(`Upload failed with status ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new UploadAbortedError());
    options.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

/** Runs `worker` over `items` with at most `limit` in flight; stops scheduling after the first failure. */
export async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  let failed: unknown = null;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length && failed === null) {
      const item = items[index++];
      try {
        await worker(item);
      } catch (error) {
        failed ??= error;
      }
    }
  });
  await Promise.all(lanes);
  if (failed !== null) throw failed;
}

export async function withRetries<T>(attempts: number, task: (attempt: number) => Promise<T>, signal?: AbortSignal): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await task(attempt);
    } catch (error) {
      if (error instanceof UploadAbortedError || signal?.aborted) throw new UploadAbortedError();
      lastError = error;
      if (attempt < attempts) await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

const PARALLEL_PARTS = 3;
const PART_ATTEMPTS = 3;
const URL_BATCH = 6;

type PartUrl = { partNumber: number; url: string };

/**
 * The part phase of a multipart upload (recordings and video materials): part URLs in batches
 * of 6 → up to 3 parallel PUTs, each retried up to 3 times with a fresh URL, ETag read from
 * the response. Returns the ETags for the completion call, sorted by part number.
 */
export async function uploadParts(options: {
  file: Blob;
  partSizeBytes: number;
  partCount: number;
  presign: (partNumbers: number[]) => Promise<PartUrl[]>;
  signal: AbortSignal;
  onProgress: (loaded: number) => void;
  parallel?: number;
}): Promise<{ partNumber: number; etag: string }[]> {
  const { file, partSizeBytes, partCount, presign, signal, onProgress } = options;
  const loaded = new Map<number, number>();
  const report = () => onProgress([...loaded.values()].reduce((a, b) => a + b, 0));
  const etags: { partNumber: number; etag: string }[] = [];

  const all = Array.from({ length: partCount }, (_, i) => i + 1);
  for (let offset = 0; offset < all.length; offset += URL_BATCH) {
    if (signal.aborted) throw new UploadAbortedError();
    const batch = all.slice(offset, offset + URL_BATCH);
    const urls = new Map((await presign(batch)).map((p) => [p.partNumber, p.url]));

    await runPool(batch, options.parallel ?? PARALLEL_PARTS, async (partNumber) => {
      const start = (partNumber - 1) * partSizeBytes;
      const blob = file.slice(start, Math.min(file.size, start + partSizeBytes));
      const { etag } = await withRetries(
        PART_ATTEMPTS,
        async (attempt) => {
          loaded.set(partNumber, 0);
          // A retry gets a fresh URL in case the previous one expired.
          const url = attempt === 1 ? urls.get(partNumber)! : (await presign([partNumber]))[0].url;
          const result = await putToPresignedUrl(url, blob, {
            signal,
            onProgress: (bytes) => {
              loaded.set(partNumber, bytes);
              report();
            },
          });
          if (!result.etag) throw new Error("Storage did not expose the ETag header");
          return result;
        },
        signal,
      );
      loaded.set(partNumber, blob.size);
      report();
      etags.push({ partNumber, etag: etag! });
    });
  }
  return etags.sort((a, b) => a.partNumber - b.partNumber);
}

export const formatBytes =(bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
};
