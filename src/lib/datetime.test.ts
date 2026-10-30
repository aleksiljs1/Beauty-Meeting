import { describe, expect, it } from "vitest";
import { academyDay, addDays, formatDate, formatDayInput, maskDigits, parseDayInput, parseTimeInput, formatMonthYear, formatTimeRange, fromZonedInputValue, isCalendarDay, timezoneAbbreviation, toZonedInputValue, weekdayIndex } from "./datetime";

describe("academy timezone (Europe/Tirane)", () => {
  it("converts admin-entered local time to UTC in winter (CET, UTC+1) and summer (CEST, UTC+2)", () => {
    expect(fromZonedInputValue("2026-11-15T09:00")?.toISOString()).toBe("2026-11-15T08:00:00.000Z");
    expect(fromZonedInputValue("2026-07-15T09:00")?.toISOString()).toBe("2026-07-15T07:00:00.000Z");
  });

  it("round-trips through the datetime-local input format", () => {
    for (const value of ["2026-01-01T00:00", "2026-03-29T04:00", "2026-10-25T01:30", "2026-12-31T23:59"]) {
      expect(toZonedInputValue(fromZonedInputValue(value)!)).toBe(value);
    }
  });

  it("handles the DST transitions (last Sunday of March / October)", () => {
    // Spring forward: 02:00 → 03:00 on 2026-03-29; 02:30 doesn't exist and resolves forward.
    expect(fromZonedInputValue("2026-03-29T01:59")?.toISOString()).toBe("2026-03-29T00:59:00.000Z");
    expect(fromZonedInputValue("2026-03-29T03:00")?.toISOString()).toBe("2026-03-29T01:00:00.000Z");
    // Fall back: 02:30 happens twice on 2026-10-25; the first occurrence (CEST) is used.
    expect(fromZonedInputValue("2026-10-25T02:30")?.toISOString()).toBe("2026-10-25T00:30:00.000Z");
  });

  it("rejects malformed input", () => {
    expect(fromZonedInputValue("15/11/2026 09:00")).toBeNull();
    expect(fromZonedInputValue("")).toBeNull();
  });

  it("formats in Albanian with the timezone shown", () => {
    expect(formatDate("2026-10-20T10:00:00Z")).toBe("20 tetor 2026");
    expect(timezoneAbbreviation("2026-11-15T08:00:00Z")).toMatch(/CET|GMT\+1/);
    expect(formatTimeRange("2026-11-15T08:00:00Z", "2026-11-15T11:00:00Z")).toMatch(/^09:00 – 12:00 \(ora e Tiranës, /);
  });

  it("puts a lesson on its Tirana calendar day, not the UTC one", () => {
    expect(academyDay("2026-11-15T23:30:00Z")).toBe("2026-11-16"); // 00:30 in Tirana
    expect(academyDay("2026-07-15T21:59:00Z")).toBe("2026-07-15"); // 23:59 in summer
  });

  it("walks calendar days and weeks for the month grid", () => {
    expect(weekdayIndex("2026-11-02")).toBe(0); // Monday
    expect(weekdayIndex("2026-11-01")).toBe(6); // Sunday
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30"); // across the DST change
    expect(formatMonthYear("2026-11-01")).toBe("nëntor 2026");
  });

  it("rejects days that don't exist instead of rolling them over", () => {
    expect(isCalendarDay("2028-02-29")).toBe(true);
    for (const day of ["2026-02-29", "2026-02-31", "2026-04-31", "2026-13-01", "2026-00-10", "2026-1-5", ""]) expect(isCalendarDay(day)).toBe(false);
  });
});

describe("typed dates and times", () => {
  it("writes and reads days as DD/MM/YYYY", () => {
    expect(formatDayInput("2026-10-28")).toBe("28/10/2026");
    expect(formatDayInput("")).toBe("");
    expect(parseDayInput("28/10/2026")).toBe("2026-10-28");
    expect(parseDayInput(" 1.2.2026 ")).toBe("2026-02-01");
    expect(parseDayInput("28-10-2026")).toBe("2026-10-28");
    for (const text of ["31/02/2026", "10/28/2026", "28/10/26", "2026-10-28", ""]) expect(parseDayInput(text), text).toBeNull();
  });

  it("reads 24-hour times", () => {
    expect(parseTimeInput("9:05")).toBe("09:05");
    expect(parseTimeInput("1730")).toBe("17:30");
    for (const text of ["24:00", "12:60", "7", "7pm"]) expect(parseTimeInput(text), text).toBeNull();
  });

  it("adds separators while only digits are typed", () => {
    expect(maskDigits("2810", [2, 2, 4], "/")).toBe("28/10");
    expect(maskDigits("281020261", [2, 2, 4], "/")).toBe("28/10/2026");
    expect(maskDigits("1/5/2026", [2, 2, 4], "/")).toBe("1/5/2026");
    expect(maskDigits("173", [2, 2], ":")).toBe("17:3");
    expect(maskDigits("28/102", [2, 2, 4], "/")).toBe("28/10/2");
    expect(maskDigits("28/", [2, 2, 4], "/")).toBe("28/");
    expect(maskDigits("28/10/", [2, 2, 4], "/")).toBe("28/10/");
    expect(maskDigits("1/", [2, 2, 4], "/")).toBe("1/");
  });
});
