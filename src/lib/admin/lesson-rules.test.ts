import { describe, expect, it } from "vitest";
import {
  defaultSchedule,
  EARLY_DEADLINE_ISSUE_PATH,
  needsEarlyDeadlineConfirmation,
  scheduleChanged,
  suggestedStart,
  validateLessonSchedule,
} from "./lesson-rules";

const at = (iso: string) => new Date(iso);
const base = {
  scheduledStartAt: at("2026-11-02T09:00:00Z"),
  scheduledEndAt: at("2026-11-02T11:00:00Z"),
  joinOpensAt: at("2026-11-02T08:45:00Z"),
  accessExpiresAt: at("2026-12-02T11:00:00Z"),
};

describe("validateLessonSchedule", () => {
  it("accepts a normal schedule", () => {
    expect(validateLessonSchedule(base)).toEqual([]);
  });

  it("requires end after start", () => {
    const issues = validateLessonSchedule({ ...base, scheduledEndAt: base.scheduledStartAt });
    expect(issues.map((i) => i.path)).toContain("scheduledEndAt");
  });

  it("allows join opening exactly at start but not after", () => {
    expect(validateLessonSchedule({ ...base, joinOpensAt: base.scheduledStartAt })).toEqual([]);
    const issues = validateLessonSchedule({ ...base, joinOpensAt: at("2026-11-02T09:01:00Z") });
    expect(issues.map((i) => i.path)).toEqual(["joinOpensAt"]);
  });

  it("rejects a deadline at or before the start outright", () => {
    const issues = validateLessonSchedule({ ...base, accessExpiresAt: base.scheduledStartAt }, true);
    expect(issues.map((i) => i.path)).toEqual(["accessExpiresAt"]);
  });

  it("asks for confirmation when the deadline is before the end", () => {
    const early = { ...base, accessExpiresAt: at("2026-11-02T10:00:00Z") };
    const issues = validateLessonSchedule(early);
    expect(issues.map((i) => i.path)).toEqual([EARLY_DEADLINE_ISSUE_PATH]);
    expect(needsEarlyDeadlineConfirmation(issues)).toBe(true);
    expect(validateLessonSchedule(early, true)).toEqual([]);
  });

  it("accepts a deadline exactly at the end without confirmation", () => {
    expect(validateLessonSchedule({ ...base, accessExpiresAt: base.scheduledEndAt })).toEqual([]);
  });

  it("does not treat other errors as a confirmation-only case", () => {
    const issues = validateLessonSchedule({ ...base, joinOpensAt: at("2026-11-02T09:30:00Z"), accessExpiresAt: at("2026-11-02T10:00:00Z") });
    expect(needsEarlyDeadlineConfirmation(issues)).toBe(false);
  });
});

describe("defaults", () => {
  it("opens join 15 minutes before and keeps access 30 days after the end", () => {
    const schedule = defaultSchedule(base.scheduledStartAt);
    expect(schedule.scheduledEndAt.toISOString()).toBe("2026-11-02T11:00:00.000Z");
    expect(schedule.joinOpensAt.toISOString()).toBe("2026-11-02T08:45:00.000Z");
    expect(schedule.accessExpiresAt.toISOString()).toBe("2026-12-02T11:00:00.000Z");
    expect(validateLessonSchedule(schedule)).toEqual([]);
  });

  it("suggests a whole hour roughly a day ahead", () => {
    const start = suggestedStart(at("2026-10-20T13:37:12Z"));
    expect(start.toISOString()).toBe("2026-10-21T13:00:00.000Z");
  });
});

describe("scheduleChanged", () => {
  it("detects changed and ignores identical or missing fields", () => {
    expect(scheduleChanged(base, {})).toBe(false);
    expect(scheduleChanged(base, { scheduledStartAt: new Date(base.scheduledStartAt) })).toBe(false);
    expect(scheduleChanged(base, { accessExpiresAt: at("2026-12-03T11:00:00Z") })).toBe(true);
  });
});
