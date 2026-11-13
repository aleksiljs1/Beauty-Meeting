/** One lesson as an iCalendar (RFC 5545) file. Pure — unit-tested. */

/** 20261113T170000Z */
const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Commas, semicolons, backslashes and newlines are escaped in text values. */
const text = (value: string) => value.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");

/** Lines longer than 75 octets continue on the next line, which starts with a space. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  for (const char of line) {
    if (new TextEncoder().encode(current + char).length > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = "";
    }
    current += char;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function lessonIcs(lesson: { id: string; title: string; start: Date; end: Date; url: string; host: string }, now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Akademia//Portali//SQ",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${lesson.id}@${lesson.host}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(lesson.start)}`,
    `DTEND:${stamp(lesson.end)}`,
    `SUMMARY:${text(lesson.title)}`,
    `DESCRIPTION:${text(`Hyni në klasë nga portali: ${lesson.url}`)}`,
    `URL:${lesson.url}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${text(lesson.title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
