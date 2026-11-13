import { describe, expect, it } from "vitest";
import { lessonIcs } from "./ics";

describe("lessonIcs", () => {
  const ics = lessonIcs(
    { id: "abc", title: "Grim, bazat; pjesa 1", start: new Date("2026-11-20T16:00:00Z"), end: new Date("2026-11-20T18:00:00Z"), url: "https://akademia.al/portal/mesimet/abc", host: "akademia.al" },
    new Date("2026-11-13T10:00:00.123Z"),
  );

  it("has the lesson's UTC times, an escaped title and CRLF lines", () => {
    expect(ics).toContain("DTSTART:20261120T160000Z\r\n");
    expect(ics).toContain("DTEND:20261120T180000Z\r\n");
    expect(ics).toContain("DTSTAMP:20261113T100000Z\r\n");
    expect(ics).toContain("SUMMARY:Grim\\, bazat\\; pjesa 1\r\n");
    expect(ics.split("\r\n").every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
  });
});
