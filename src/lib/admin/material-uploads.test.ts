import { describe, expect, it } from "vitest";
import { prepareMaterialFile, summarizeUploads } from "./material-uploads";

const MB = 1024 * 1024;

describe("prepareMaterialFile", () => {
  it("accepts documents and images with a single upload", () => {
    expect(prepareMaterialFile({ name: "Udhëzuesi.pdf", type: "application/pdf", size: 2 * MB })).toEqual({ ok: true, mimeType: "application/pdf", multipart: false });
    // Windows browsers sometimes report no type for Office files.
    expect(prepareMaterialFile({ name: "Prezantimi.pptx", type: "", size: MB })).toMatchObject({ ok: true, multipart: false });
  });

  it("accepts MP4 videos up to 4 GB with a multipart upload", () => {
    expect(prepareMaterialFile({ name: "Teknika.mp4", type: "video/mp4", size: 300 * MB })).toEqual({ ok: true, mimeType: "video/mp4", multipart: true });
    expect(prepareMaterialFile({ name: "Teknika.m4v", type: "video/x-m4v", size: MB })).toEqual({ ok: true, mimeType: "video/mp4", multipart: true });
    expect(prepareMaterialFile({ name: "Teknika.mp4", type: "video/mp4", size: 4 * 1024 * MB + 1 })).toEqual({ ok: false, reason: "size", limit: "4 GB" });
  });

  it("allows documents up to 100 MB while keeping images at 50 MB", () => {
    expect(prepareMaterialFile({ name: "a.pdf", type: "application/pdf", size: 100 * MB })).toMatchObject({ ok: true });
    expect(prepareMaterialFile({ name: "a.pdf", type: "application/pdf", size: 100 * MB + 1 })).toEqual({ ok: false, reason: "size", limit: "100 MB" });
    expect(prepareMaterialFile({ name: "a.png", type: "image/png", size: 50 * MB + 1 })).toEqual({ ok: false, reason: "size", limit: "50 MB" });
  });

  it("rejects disallowed or mismatched types and empty files", () => {
    expect(prepareMaterialFile({ name: "setup.exe", type: "application/x-msdownload", size: 10 })).toEqual({ ok: false, reason: "type" });
    expect(prepareMaterialFile({ name: "klip.mov", type: "video/quicktime", size: 10 })).toEqual({ ok: false, reason: "type" });
    expect(prepareMaterialFile({ name: "faqja.pdf", type: "text/html", size: 10 })).toEqual({ ok: false, reason: "type" });
    expect(prepareMaterialFile({ name: "bosh.pdf", type: "application/pdf", size: 0 })).toMatchObject({ ok: false, reason: "size" });
  });
});

describe("summarizeUploads", () => {
  it("counts outcomes and knows when the batch is finished", () => {
    expect(summarizeUploads(["done", "failed", "uploading", "queued"])).toMatchObject({ total: 4, done: 1, failed: 1, active: 2, finished: false });
    expect(summarizeUploads(["done", "failed", "cancelled"])).toMatchObject({ done: 1, failed: 1, cancelled: 1, finished: true });
  });
});
