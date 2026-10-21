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

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
};
