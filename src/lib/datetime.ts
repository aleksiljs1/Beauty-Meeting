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

// --- Calendar dates ("YYYY-MM-DD", no time of day) --------------------------------------------

/** The academy-time calendar day of an instant, e.g. "2026-10-28". */
export const academyDay = (value: DateInput) => toZonedInputValue(value).slice(0, 10);
export const todayInAcademy = (now: Date = new Date()) => academyDay(now);

/** "YYYY-MM-DD" ⇄ a Postgres DATE column (read and written as UTC midnight). */
export const fromDbDate = (date: Date) => date.toISOString().slice(0, 10);
export const toDbDate = (day: string) => new Date(`${day}T00:00:00Z`);

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const parseDay = (day: string) => day.split("-").map(Number) as [number, number, number];

/** A real "YYYY-MM-DD" day (rejects 2026-02-31 and 2026-13-01, which Date would quietly roll over). */
export const isCalendarDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && addDays(day, 0) === day;

export function addDays(day: string, days: number): string {
  const [y, m, d] = parseDay(day);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Calendar months later, clamped to the month's last day (31 Jan + 1 → 28/29 Feb). */
export function addMonths(day: string, months: number): string {
  const [y, m, d] = parseDay(day);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-${pad(Math.min(d, lastDay))}`;
}

/** 0 = Monday … 6 = Sunday (weeks start on Monday in Albania). */
export const weekdayIndex = (day: string) => (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;

const monthFormatter = new Intl.DateTimeFormat(LOCALE, { timeZone: "UTC", month: "long", year: "numeric" });
/** "2026-11-01" → "nëntor 2026" */
export const formatMonthYear = (day: string) => monthFormatter.format(new Date(`${day}T12:00:00Z`));

/** "2026-10-28" → "28 tetor 2026". Noon UTC is the same calendar day in Tirana all year. */
export const formatCalendarDate = (value: string) => formatDate(`${value}T12:00:00Z`);

// --- Typed dates and times (DD/MM/YYYY, 24-hour HH:MM) ------------------------------------------

/** "2026-10-28" → "28/10/2026", the way dates are written in Albania. */
export const formatDayInput = (day: string) => (isCalendarDay(day) ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : "");

/** "28/10/2026" (also "28.10.2026", "28-10-2026", "1/2/2026") → "2026-10-28"; null when it isn't a real day. */
export function parseDayInput(text: string): string | null {
  const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text.trim());
  if (!match) return null;
  const day = `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return isCalendarDay(day) ? day : null;
}

/** "9:05" / "09:05" / "0905" → "09:05"; null when it isn't a time of day. */
export function parseTimeInput(text: string): string | null {
  const match = /^(\d{1,2}):?(\d{2})$/.exec(text.trim());
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

/**
 * Puts the separators in by themselves while typing: "2810" → "28/10", "28/102026" →
 * "28/10/2026" (`groups` 2,2,4 with "/"; 2,2 with ":" for a time). Text the admin separates
 * differently ("1/5/2026") is left as typed.
 */
export function maskDigits(text: string, groups: number[], separator: string): string {
  const pieces = text.split(separator);
  if (!pieces.every((piece) => /^\d*$/.test(piece))) return text;
  // Separators typed by hand must sit where the automatic ones would.
  const boundaries = groups.map((_, i) => groups.slice(0, i + 1).reduce((a, b) => a + b, 0));
  let before = 0;
  for (const piece of pieces.slice(0, -1)) {
    before += piece.length;
    if (!boundaries.includes(before)) return text;
  }
  let rest = pieces.join("").slice(0, boundaries.at(-1));
  const parts: string[] = [];
  for (const size of groups) {
    if (!rest) break;
    parts.push(rest.slice(0, size));
    rest = rest.slice(size);
  }
  const masked = parts.join(separator);
  // Keep a separator the admin just typed, so it doesn't vanish under their cursor.
  const typedSeparator = text.endsWith(separator) && boundaries.slice(0, -1).includes(parts.join("").length);
  return typedSeparator ? masked + separator : masked;
}
