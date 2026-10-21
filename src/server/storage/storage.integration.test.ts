import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";

// Requires `docker compose up` + `npm run storage:init`. Run with: npm run test:integration
const { deleteObject, headObject, newObjectKey, presignGet, presignPut, readObjectHead } = await import("./storage");
const { env } = await import("@/server/env");

const key = newObjectKey("materials", "integration-test");
const pdf = new TextEncoder().encode("%PDF-1.7\n% integration test\n");

afterAll(async () => {
  await deleteObject(key).catch(() => undefined);
});

describe("private storage", () => {
  it("accepts an upload only through a presigned URL with the signed size and type", async () => {
    const url = await presignPut({ key, contentType: "application/pdf", contentLength: pdf.byteLength });

    const wrongType = await fetch(url, { method: "PUT", body: pdf, headers: { "Content-Type": "text/html" } });
    expect(wrongType.ok).toBe(false);

    const upload = await fetch(url, { method: "PUT", body: pdf, headers: { "Content-Type": "application/pdf" } });
    expect(upload.ok).toBe(true);

    expect(await headObject(key)).toMatchObject({ size: pdf.byteLength });
    const head = await readObjectHead(key, 5);
    expect(new TextDecoder().decode(head)).toBe("%PDF-");
  });

  it("refuses anonymous reads of private objects", async () => {
    const direct = await fetch(`${env.S3_ENDPOINT}/${env.S3_BUCKET}/${key}`);
    expect(direct.ok).toBe(false);
    expect([401, 403]).toContain(direct.status);
  });

  it("serves the object through a short-lived presigned GET with safe headers", async () => {
    const url = await presignGet({ key, expiresIn: 30, contentType: "application/pdf", filename: "Mësimi 1.pdf", disposition: "inline" });
    expect(new URL(url).searchParams.get("X-Amz-Expires")).toBe("30");

    const response = await fetch(url);
    expect(response.ok).toBe(true);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdf);
  });

  it("caps read grants at 60 seconds even if asked for longer", async () => {
    const url = await presignGet({ key, expiresIn: 3600, contentType: "application/pdf", filename: "a.pdf", disposition: "attachment" });
    expect(new URL(url).searchParams.get("X-Amz-Expires")).toBe("60");
  });

  it("supports byte-range reads (needed for video seeking)", async () => {
    const url = await presignGet({ key, expiresIn: 30, contentType: "application/pdf", filename: "a.pdf", disposition: "inline" });
    const response = await fetch(url, { headers: { Range: "bytes=0-3" } });
    expect(response.status).toBe(206);
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe("%PDF");
  });
});
