/**
 * Date/time helpers shared by server and browser. Timestamps are stored and compared in UTC;
 * they are only displayed (and entered by the admin) in the academy's timezone.
 */

export const ACADEMY_TIMEZONE = "Europe/Tirane";
export const ACADEMY_TIMEZONE_LABEL = "ora e Tiranës";
const LOCALE = "sq-AL";

type DateInput = Date | string | number;
const toDate = (value: DateInput) => (value instanceof Date ? value : new Date(value));

const formatters = {
  date: new Intl.DateTimeFormat(LOCALE, { timeZone: ACADEMY_TIMEZONE, day: "numeric", month: "long", year: "numeric" }),
  weekdayDate: new Intl.DateTimeFormat(LOCALE, { timeZone: ACADEMY_TIMEZONE, weekday: "long", day: "numeric", month: "long" }),
  time: new Intl.DateTimeFormat(LOCALE, { timeZone: ACADEMY_TIMEZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
  zone: new Intl.DateTimeFormat("en-GB", { timeZone: ACADEMY_TIMEZONE, timeZoneName: "short" }),
};

/** "20 tetor 2026" */
export const formatDate = (value: DateInput) => formatters.date.format(toDate(value));
/** "e martë, 20 tetor" */
export const formatWeekdayDate = (value: DateInput) => formatters.weekdayDate.format(toDate(value));
/** "09:00" */
export const formatTime = (value: DateInput) => formatters.time.format(toDate(value));
/** "20 tetor 2026, 09:00" */
export const formatDateTime = (value: DateInput) => `${formatDate(value)}, ${formatTime(value)}`;

/** Short zone name at that instant, e.g. "CET" / "CEST" — shown next to schedules and deadlines. */
export function timezoneAbbreviation(value: DateInput): string {
  return formatters.zone.formatToParts(toDate(value)).find((p) => p.type === "timeZoneName")?.value ?? "";
}

/** "09:00 – 12:00 (ora e Tiranës, CET)" */
export function formatTimeRange(start: DateInput, end: DateInput): string {
  return `${formatTime(start)} – ${formatTime(end)} (${ACADEMY_TIMEZONE_LABEL}, ${timezoneAbbreviation(start)})`;
}

// --- Admin form conversions (<input type="datetime-local"> ⇄ UTC) ---------------------------

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ACADEMY_TIMEZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function zonedParts(date: Date) {
  const parts = Object.fromEntries(partsFormatter.formatToParts(date).map((p) => [p.type, p.value]));
  return { year: +parts.year, month: +parts.month, day: +parts.day, hour: +parts.hour, minute: +parts.minute, second: +parts.second };
}

/** Offset (ms) of the academy timezone from UTC at a given instant. */
function offsetAt(date: Date): number {
  const p = zonedParts(date);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
}

/** UTC instant → "YYYY-MM-DDTHH:mm" in academy time (value for a datetime-local input). */
export function toZonedInputValue(value: DateInput): string {
  const p = zonedParts(toDate(value));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * "YYYY-MM-DDTHH:mm" entered in academy time → UTC Date. Handles DST: a time that doesn't exist
 * (spring-forward gap) resolves forward; an ambiguous time (fall-back) resolves to the first one.
 * Returns null for malformed input.
 */
export function fromZonedInputValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  const wallClockAsUtc = Date.UTC(y, mo - 1, d, h, mi);
  if (Number.isNaN(wallClockAsUtc)) return null;

  // Two passes converge on the right offset, including across DST transitions.
  let guess = wallClockAsUtc - offsetAt(new Date(wallClockAsUtc));
  guess = wallClockAsUtc - offsetAt(new Date(guess));
  const earlier = wallClockAsUtc - offsetAt(new Date(guess - 3_600_000));
  if (earlier !== guess && toZonedInputValue(earlier) === value) guess = earlier;
  return new Date(guess);
}
