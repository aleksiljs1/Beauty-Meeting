/**
 * Reads pixel dimensions from the first bytes of a PNG, JPEG or WebP file without decoding it.
 * Returns null when the header is not understood (the caller then stores no dimensions).
 */
export function readImageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const has = (n: number) => bytes.byteLength >= n;
  const valid = (width: number, height: number) => (width > 0 && height > 0 && width <= 65_535 && height <= 65_535 ? { width, height } : null);

  // PNG: IHDR is always the first chunk.
  if (has(24) && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return valid(view.getUint32(16), view.getUint32(20));
  }

  // WebP: RIFF....WEBP + VP8 / VP8L / VP8X chunk.
  if (has(30) && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    const chunk = ascii(bytes, 12, 4);
    if (chunk === "VP8 ") return valid(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
    if (chunk === "VP8L") {
      const b = view.getUint32(21, true);
      return valid((b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1);
    }
    if (chunk === "VP8X") {
      const w = bytes[24] | (bytes[25] << 8) | (bytes[26] << 16);
      const h = bytes[27] | (bytes[28] << 8) | (bytes[29] << 16);
      return valid(w + 1, h + 1);
    }
    return null;
  }

  // JPEG: walk segments until a start-of-frame marker.
  if (has(4) && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.byteLength) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1];
      if (marker === 0xff) {
        offset += 1;
        continue;
      }
      const length = view.getUint16(offset + 2);
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) return valid(view.getUint16(offset + 7), view.getUint16(offset + 5));
      if (length < 2) return null;
      offset += 2 + length;
    }
  }
  return null;
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}
