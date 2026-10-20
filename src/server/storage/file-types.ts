/**
 * Upload allowlist. A file is accepted only when its extension, declared type AND its
 * actual leading bytes agree — browser MIME types and filenames alone are never trusted.
 * Pure module (no I/O) so it can be unit-tested.
 */

export type UploadKind = "material" | "recording" | "image";

type FileRule = {
  mime: string;
  extensions: string[];
  /** Whether browsers may render it inline. Everything else is served as a download. */
  inline: boolean;
  matches: (head: Uint8Array) => boolean;
};

const startsWith = (head: Uint8Array, bytes: number[], offset = 0) => bytes.every((b, i) => head[offset + i] === b);
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

const isPdf = (h: Uint8Array) => startsWith(h, ascii("%PDF-"));
const isZip = (h: Uint8Array) => startsWith(h, [0x50, 0x4b, 0x03, 0x04]); // OOXML (docx/pptx/xlsx) containers
const isMp4 = (h: Uint8Array) => startsWith(h, ascii("ftyp"), 4);
const isPng = (h: Uint8Array) => startsWith(h, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isJpeg = (h: Uint8Array) => startsWith(h, [0xff, 0xd8, 0xff]);
const isWebp = (h: Uint8Array) => startsWith(h, ascii("RIFF")) && startsWith(h, ascii("WEBP"), 8);

const RULES: Record<UploadKind, FileRule[]> = {
  material: [
    { mime: "application/pdf", extensions: ["pdf"], inline: true, matches: isPdf },
    {
      mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      extensions: ["pptx"],
      inline: false,
      matches: isZip,
    },
    {
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      extensions: ["docx"],
      inline: false,
      matches: isZip,
    },
    { mime: "image/png", extensions: ["png"], inline: true, matches: isPng },
    { mime: "image/jpeg", extensions: ["jpg", "jpeg"], inline: true, matches: isJpeg },
  ],
  recording: [{ mime: "video/mp4", extensions: ["mp4", "m4v"], inline: true, matches: isMp4 }],
  image: [
    { mime: "image/jpeg", extensions: ["jpg", "jpeg"], inline: true, matches: isJpeg },
    { mime: "image/png", extensions: ["png"], inline: true, matches: isPng },
    { mime: "image/webp", extensions: ["webp"], inline: true, matches: isWebp },
  ],
};

/** Practical limits per kind (bytes). Recordings use multipart uploads. */
export const MAX_UPLOAD_BYTES: Record<UploadKind, number> = {
  material: 50 * 1024 * 1024,
  recording: 8 * 1024 * 1024 * 1024,
  image: 10 * 1024 * 1024,
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
