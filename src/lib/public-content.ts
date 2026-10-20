/**
 * Pure helpers for public website content, shared by Server Components, admin forms and
 * route handlers (no I/O, safe in the browser).
 */

export type OpeningHoursRow = { days: string; hours: string };

/** Accepts the JSON column as stored and keeps only well-formed rows. */
export function parseOpeningHours(value: unknown): OpeningHoursRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const { days, hours } = row as Record<string, unknown>;
    if (typeof days !== "string" || typeof hours !== "string") return [];
    if (!days.trim() && !hours.trim()) return [];
    return [{ days: days.trim(), hours: hours.trim() }];
  });
}

/** URL slug from a title: lower-case ASCII, Albanian ë/ç folded, words joined by "-". */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const digitsOf = (value: string) => value.replace(/\D/g, "");

/** `https://wa.me/<digits>` (international number without "+" or "00"), or null when unusable. */
export function whatsappHref(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!/^[+\d\s().-]+$/.test(value.trim())) return null;
  let digits = digitsOf(value);
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits.length >= 8 && digits.length <= 15 ? `https://wa.me/${digits}` : null;
}

/** `tel:` link for a plausible phone number (placeholders such as "[+355 …]" give null). */
export function telHref(value: string | null | undefined): string | null {
  if (!value || !/^[+\d\s().-]+$/.test(value.trim())) return null;
  const digits = digitsOf(value);
  if (digits.length < 6 || digits.length > 15) return null;
  return `tel:${value.trim().startsWith("+") ? "+" : ""}${digits}`;
}

const EMAIL_PATTERN = /^[^\s@[\]<>()]+@[^\s@[\]<>()]+\.[a-z]{2,}$/i;

export function mailtoHref(value: string | null | undefined): string | null {
  return value && EMAIL_PATTERN.test(value.trim()) ? `mailto:${value.trim()}` : null;
}

/** Only http(s) links are rendered (never javascript:, data:, …). */
export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Splits admin-entered long text into paragraphs (blank-line separated). */
export function paragraphs(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
