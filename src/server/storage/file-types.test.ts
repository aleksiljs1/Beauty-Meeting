import { describe, expect, it } from "vitest";
import { bytesMatch, checkDeclaredFile, declaredMimeFor, formatLimit, isInlineSafe, maxBytesFor, ruleForDeclaredFile, sanitizeDisplayName, usesMultipart } from "./file-types";

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(values.flatMap((v) => (typeof v === "string" ? [...v].map((c) => c.charCodeAt(0)) : [v])));

describe("upload allowlist", () => {
  it("requires extension and declared type to agree", () => {
    expect(ruleForDeclaredFile("material", "Leksioni.pdf", "application/pdf")).not.toBeNull();
    expect(ruleForDeclaredFile("material", "Leksioni.pdf", "text/html")).toBeNull();
    expect(ruleForDeclaredFile("material", "virus.exe", "application/pdf")).toBeNull();
    expect(ruleForDeclaredFile("material", "page.html", "text/html")).toBeNull();
    expect(ruleForDeclaredFile("image", "logo.svg", "image/svg+xml")).toBeNull(); // SVG can carry script
  });

  it("checks the real bytes, not the name", () => {
    expect(bytesMatch("material", "application/pdf", bytes("%PDF-1.7"))).toBe(true);
    expect(bytesMatch("material", "application/pdf", bytes("<html><script>"))).toBe(false);
    expect(bytesMatch("recording", "video/mp4", bytes(0, 0, 0, 0x20, "ftypisom"))).toBe(true);
    expect(bytesMatch("recording", "video/mp4", bytes("%PDF-1.7"))).toBe(false);
  });

  it("serves office documents as downloads only", () => {
    expect(isInlineSafe("material", "application/pdf")).toBe(true);
    expect(isInlineSafe("material", "application/vnd.openxmlformats-officedocument.presentationml.presentation")).toBe(false);
  });
});

describe("video materials", () => {
  const MB = 1024 * 1024;

  it("allows MP4 materials, verified by their bytes, with a 1 GB limit and multipart upload", () => {
    expect(ruleForDeclaredFile("material", "Teknika.mp4", "video/mp4")).not.toBeNull();
    expect(ruleForDeclaredFile("material", "Teknika.m4v", "video/mp4")).not.toBeNull();
    expect(ruleForDeclaredFile("material", "Teknika.mov", "video/quicktime")).toBeNull();
    expect(bytesMatch("material", "video/mp4", bytes(0, 0, 0, 0x18, "ftypmp42"))).toBe(true);
    expect(bytesMatch("material", "video/mp4", bytes("%PDF-1.7"))).toBe(false);
    expect(isInlineSafe("material", "video/mp4")).toBe(true);
    expect(maxBytesFor("material", "video/mp4")).toBe(1024 * MB);
    expect(maxBytesFor("material", "application/pdf")).toBe(50 * MB);
    expect(usesMultipart("material", "video/mp4")).toBe(true);
    expect(usesMultipart("material", "application/pdf")).toBe(false);
  });

  it("checks type and per-type size together", () => {
    expect(checkDeclaredFile("material", { filename: "a.mp4", mimeType: "video/mp4", sizeBytes: 60 * MB })).toMatchObject({ ok: true, multipart: true });
    expect(checkDeclaredFile("material", { filename: "a.pdf", mimeType: "application/pdf", sizeBytes: 60 * MB })).toEqual({ ok: false, reason: "size", maxBytes: 50 * MB });
    expect(checkDeclaredFile("material", { filename: "a.exe", mimeType: "video/mp4", sizeBytes: 1 })).toEqual({ ok: false, reason: "type" });
    expect(formatLimit(50 * MB)).toBe("50 MB");
    expect(formatLimit(1024 * MB)).toBe("1 GB");
  });

  it("normalizes missing or alias browser types by extension only", () => {
    expect(declaredMimeFor("material", "a.docx", "")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(declaredMimeFor("material", "a.m4v", "video/x-m4v")).toBe("video/mp4");
    expect(declaredMimeFor("material", "a.pdf", "text/html")).toBe("text/html"); // left for the check to reject
    expect(declaredMimeFor("material", "a.exe", "")).toBe("application/octet-stream");
  });
});

describe("sanitizeDisplayName", () => {
  it("strips paths and unsafe characters but keeps Albanian letters", () => {
    expect(sanitizeDisplayName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeDisplayName("C:\\Users\\x\\Ngjyrosja e flokëve.pdf")).toBe("Ngjyrosja e flokëve.pdf");
    expect(sanitizeDisplayName('a<b>"c".pdf')).toBe("abc.pdf");
    expect(sanitizeDisplayName("..")).toBe("skedar");
  });
});
