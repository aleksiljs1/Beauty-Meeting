import { checkDeclaredFile, declaredMimeFor, formatLimit } from "@/server/storage/file-types";

/**
 * Pure helpers for the admin's multi-file material upload. Validation uses the server's own
 * allowlist (`checkDeclaredFile`) so a file the server would refuse is rejected before any
 * bytes are sent; the server still re-checks everything and verifies the real bytes.
 */

export type PreparedMaterialFile =
  | { ok: true; mimeType: string; multipart: boolean }
  | { ok: false; reason: "type" }
  | { ok: false; reason: "size"; limit: string };

export function prepareMaterialFile(file: { name: string; type: string; size: number }): PreparedMaterialFile {
  const mimeType = declaredMimeFor("material", file.name, file.type);
  const check = checkDeclaredFile("material", { filename: file.name, mimeType, sizeBytes: file.size });
  if (check.ok) return { ok: true, mimeType: check.mime, multipart: check.multipart };
  return check.reason === "type" ? { ok: false, reason: "type" } : { ok: false, reason: "size", limit: formatLimit(check.maxBytes) };
}

export type UploadItemStatus = "queued" | "uploading" | "verifying" | "done" | "failed" | "cancelled";

export function summarizeUploads(statuses: UploadItemStatus[]) {
  const count = (status: UploadItemStatus) => statuses.filter((s) => s === status).length;
  const active = count("queued") + count("uploading") + count("verifying");
  return { total: statuses.length, done: count("done"), failed: count("failed"), cancelled: count("cancelled"), active, finished: active === 0 };
}
