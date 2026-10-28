/**
 * Upload allowlist. A file is accepted only when its extension, declared type AND its
 * actual leading bytes agree — browser MIME types and filenames alone are never trusted.
 * Pure module (no I/O) so it can be unit-tested — and imported by the admin UI, which runs the
 * same declared-file check before uploading (the server stays the authority).
 */

export type UploadKind = "material" | "recording" | "image";

type FileRule = {
  mime: string;
  extensions: string[];
  /** Whether browsers may render it inline. Everything else is served as a download. */
  inline: boolean;
  matches: (head: Uint8Array) => boolean;
  /** Overrides the kind's default size limit (e.g. video materials). */
  maxBytes?: number;
  /** Non-standard types some browsers report for this extension (normalized client-side). */
  aliases?: string[];
  /** Uploaded in parts (large files); everything else uses one presigned PUT. */
  multipart?: boolean;
};

const startsWith = (head: Uint8Array, bytes: number[], offset = 0) => bytes.every((b, i) => head[offset + i] === b);
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

const isPdf = (h: Uint8Array) => startsWith(h, ascii("%PDF-"));
const isZip = (h: Uint8Array) => startsWith(h, [0x50, 0x4b, 0x03, 0x04]); // OOXML (docx/pptx/xlsx) containers
const isMp4 = (h: Uint8Array) => startsWith(h, ascii("ftyp"), 4);
const isPng = (h: Uint8Array) => startsWith(h, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isJpeg = (h: Uint8Array) => startsWith(h, [0xff, 0xd8, 0xff]);
const isWebp = (h: Uint8Array) => startsWith(h, ascii("RIFF")) && startsWith(h, ascii("WEBP"), 8);

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** PDF and Office lesson documents use a single presigned upload up to 100 MB. */
export const MATERIAL_DOCUMENT_MAX_BYTES = 100 * MB;
/** Short technique demos next to the lesson; full lesson recordings belong in Recordings (8 GB). */
export const MATERIAL_VIDEO_MAX_BYTES = 4 * GB;

const RULES: Record<UploadKind, FileRule[]> = {
  material: [
    { mime: "application/pdf", extensions: ["pdf"], inline: true, matches: isPdf, maxBytes: MATERIAL_DOCUMENT_MAX_BYTES },
    {
      mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      extensions: ["pptx"],
      inline: false,
      matches: isZip,
      maxBytes: MATERIAL_DOCUMENT_MAX_BYTES,
    },
    {
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      extensions: ["docx"],
      inline: false,
      matches: isZip,
      maxBytes: MATERIAL_DOCUMENT_MAX_BYTES,
    },
    { mime: "image/png", extensions: ["png"], inline: true, matches: isPng },
    { mime: "image/jpeg", extensions: ["jpg", "jpeg"], inline: true, matches: isJpeg },
    {
      mime: "video/mp4",
      extensions: ["mp4", "m4v"],
      inline: true,
      matches: isMp4,
      maxBytes: MATERIAL_VIDEO_MAX_BYTES,
      aliases: ["video/x-m4v"],
      multipart: true,
    },
  ],
  recording: [{ mime: "video/mp4", extensions: ["mp4", "m4v"], inline: true, matches: isMp4, aliases: ["video/x-m4v"], multipart: true }],
  image: [
    { mime: "image/jpeg", extensions: ["jpg", "jpeg"], inline: true, matches: isJpeg },
    { mime: "image/png", extensions: ["png"], inline: true, matches: isPng },
    { mime: "image/webp", extensions: ["webp"], inline: true, matches: isWebp },
  ],
};

/** Default limits per kind (bytes); a rule's `maxBytes` overrides it. Recordings use multipart uploads. */
export const MAX_UPLOAD_BYTES: Record<UploadKind, number> = {
  material: 50 * MB,
  recording: 8 * GB,
  image: 10 * MB,
};

/** Bytes needed from the start of an object to identify it. */
export const SNIFF_BYTES = 16;

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

/** Picks the rule for a declared upload, before any bytes exist. */
export function ruleForDeclaredFile(kind: UploadKind, filename: string, declaredMime: string): FileRule | null {
  const ext = extensionOf(filename);
  return RULES[kind].find((rule) => rule.extensions.includes(ext) && rule.mime === declaredMime) ?? null;
}

/** Size limit for one declared type (falls back to the kind's default). */
export function maxBytesFor(kind: UploadKind, mime: string): number {
  return RULES[kind].find((r) => r.mime === mime)?.maxBytes ?? MAX_UPLOAD_BYTES[kind];
}

/** Whether this type is uploaded with a multipart upload instead of one presigned PUT. */
export function usesMultipart(kind: UploadKind, mime: string): boolean {
  return RULES[kind].find((r) => r.mime === mime)?.multipart ?? false;
}

export type DeclaredFileCheck = { ok: true; mime: string; maxBytes: number; multipart: boolean } 
  | { ok: false; reason: "type" }
  | { ok: false; reason: "size"; maxBytes: number };

/**
 * The declared-file check shared by the server (authoritative) and the admin UI (early
 * feedback before anything is uploaded): allowed extension + type, and a size within the
 * limit for that type. The real bytes are still verified after upload.
 */
export function checkDeclaredFile(kind: UploadKind, file: { filename: string; mimeType: string; sizeBytes: number }): DeclaredFileCheck {
  const rule = ruleForDeclaredFile(kind, file.filename, file.mimeType);
  if (!rule) return { ok: false, reason: "type" };
  const maxBytes = rule.maxBytes ?? MAX_UPLOAD_BYTES[kind];
  if (file.sizeBytes <= 0 || file.sizeBytes > maxBytes) return { ok: false, reason: "size", maxBytes };
  return { ok: true, mime: rule.mime, maxBytes, multipart: rule.multipart ?? false };
}

/**
 * The type to declare for a picked file. Browsers report an empty type for some Office files
 * on Windows and `video/x-m4v` for .m4v; both are mapped to the allowlisted type for that
 * extension. Anything else is passed through unchanged (and rejected by the check).
 */
export function declaredMimeFor(kind: UploadKind, filename: string, browserType: string): string {
  const ext = extensionOf(filename);
  const rule = RULES[kind].find((r) => r.extensions.includes(ext));
  if (!rule) return browserType || "application/octet-stream";
  if (!browserType || browserType === "application/octet-stream" || rule.aliases?.includes(browserType)) return rule.mime;
  return browserType;
}

/** Human-readable limit for messages ("50 MB", "100 MB", "4 GB"). */
export function formatLimit(bytes: number): string {
  return bytes >= GB ? `${Math.round(bytes / GB)} GB` : `${Math.round(bytes / MB)} MB`;
}

/** Confirms the uploaded bytes match the rule chosen at upload time. */
export function bytesMatch(kind: UploadKind, mime: string, head: Uint8Array): boolean {
  const rule = RULES[kind].find((r) => r.mime === mime);
  return rule ? rule.matches(head) : false;
}

export function isInlineSafe(kind: UploadKind, mime: string): boolean {
  return RULES[kind].find((r) => r.mime === mime)?.inline ?? false;
}

export function acceptedExtensions(kind: UploadKind): string[] {
  return RULES[kind].flatMap((r) => r.extensions.map((e) => `.${e}`));
}

/**
 * Display filename: strips paths and control characters, keeps Unicode letters (Albanian ë, ç),
 * collapses whitespace and bounds the length. Never used to build storage keys.
 */
export function sanitizeDisplayName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned === "." || cleaned === "..") return "skedar";
  return cleaned.length > 150 ? cleaned.slice(0, 150) : cleaned;
}
