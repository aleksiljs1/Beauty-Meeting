import { describe, expect, it } from "vitest";
import { readImageDimensions } from "./image-dimensions";

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

describe("readImageDimensions", () => {
  it("reads PNG", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...u32(13), ...ascii("IHDR"), ...u32(640), ...u32(480), 8, 6, 0, 0, 0]);
    expect(readImageDimensions(png)).toEqual({ width: 640, height: 480 });
  });

  it("reads JPEG after an APP0 segment", () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x10, ...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x00, 0xc8, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(readImageDimensions(jpeg)).toEqual({ width: 200, height: 300 });
  });

  it("reads WebP VP8X", () => {
    const webp = new Uint8Array([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP"), ...ascii("VP8X"), 10, 0, 0, 0, 0, 0, 0, 0, 0x1f, 0x03, 0x00, 0x57, 0x02, 0x00]);
    expect(readImageDimensions(webp)).toEqual({ width: 800, height: 600 });
  });

  it("returns null for unknown data", () => {
    expect(readImageDimensions(new TextEncoder().encode("<html>not an image</html>"))).toBeNull();
  });
});
