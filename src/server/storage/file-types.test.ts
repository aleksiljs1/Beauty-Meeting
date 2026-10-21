import { describe, expect, it } from "vitest";
import { bytesMatch, isInlineSafe, ruleForDeclaredFile, sanitizeDisplayName } from "./file-types";

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

describe("sanitizeDisplayName", () => {
  it("strips paths and unsafe characters but keeps Albanian letters", () => {
    expect(sanitizeDisplayName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeDisplayName("C:\\Users\\x\\Ngjyrosja e flokëve.pdf")).toBe("Ngjyrosja e flokëve.pdf");
    expect(sanitizeDisplayName('a<b>"c".pdf')).toBe("abc.pdf");
    expect(sanitizeDisplayName("..")).toBe("skedar");
  });
});
