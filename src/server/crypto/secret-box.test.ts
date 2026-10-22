import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./secret-box";

const key = randomBytes(32).toString("base64url");

describe("secret box", () => {
  it("round-trips and never contains the plaintext", () => {
    const sealed = encryptSecret("483920", key);
    expect(sealed).not.toContain("483920");
    expect(decryptSecret(sealed, key)).toBe("483920");
  });

  it("uses a fresh IV every time", () => {
    expect(encryptSecret("same", key)).not.toBe(encryptSecret("same", key));
  });

  it("rejects tampering and the wrong key", () => {
    const sealed = encryptSecret("483920", key);
    const [v, iv, data, tag] = sealed.split(".");
    const flipped = Buffer.from(data, "base64url");
    flipped[0] ^= 1;
    expect(() => decryptSecret([v, iv, flipped.toString("base64url"), tag].join("."), key)).toThrow();
    expect(() => decryptSecret(sealed, randomBytes(32))).toThrow();
    expect(() => decryptSecret("garbage", key)).toThrow();
  });

  it("refuses keys that aren't 32 bytes", () => {
    expect(() => encryptSecret("x", randomBytes(16))).toThrow();
  });
});
