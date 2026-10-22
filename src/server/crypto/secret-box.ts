import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Small authenticated-encryption helper (AES-256-GCM) for secrets we must store and later
 * read back, such as Zoom meeting passcodes. Format: `v1.<iv>.<ciphertext>.<tag>` (base64url).
 * The key is 32 bytes; pass it explicitly so this module stays pure and testable.
 */
const VERSION = "v1";

function toKey(key: string | Buffer): Buffer {
  const bytes = typeof key === "string" ? Buffer.from(key, "base64url") : key;
  if (bytes.length !== 32) throw new Error("Encryption key must be 32 bytes");
  return bytes;
}

export function encryptSecret(plaintext: string, key: string | Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", toKey(key), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), ciphertext.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}

/** Throws if the value was tampered with or encrypted with another key. */
export function decryptSecret(sealed: string, key: string | Buffer): string {
  const [version, iv, ciphertext, tag] = sealed.split(".");
  if (version !== VERSION || !iv || ciphertext === undefined || !tag) throw new Error("Unsupported encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", toKey(key), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
