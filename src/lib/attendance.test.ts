import { describe, expect, it } from "vitest";
import { formatMinutes, summarizeStays } from "./attendance";

const at = (hhmm: string) => new Date(`2026-11-05T${hhmm}:00Z`);

describe("attendance summary", () => {
  it("adds up separate stays and counts the joins", () => {
    expect(summarizeStays([{ joinedAt: at("17:00"), leftAt: at("17:40") }, { joinedAt: at("18:00"), leftAt: at("18:30") }], at("19:00"))).toEqual({
      minutes: 70,
      joins: 2,
      firstJoinedAt: at("17:00"),
      lastLeftAt: at("18:30"),
    });
  });

  it("counts overlapping stays once (two devices at the same time)", () => {
    const summary = summarizeStays([{ joinedAt: at("17:00"), leftAt: at("18:00") }, { joinedAt: at("17:30"), leftAt: at("18:15") }], at("19:00"));
    expect(summary?.minutes).toBe(75);
  });

  it("counts a stay that is still open up to now", () => {
    expect(summarizeStays([{ joinedAt: at("17:00"), leftAt: null }], at("17:20"))).toMatchObject({ minutes: 20, lastLeftAt: null });
  });

  it("has nothing to say about someone who never joined", () => {
    expect(summarizeStays([], at("17:00"))).toBeNull();
  });

  it("writes durations in Albanian", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(65)).toBe("1 orë 5 min");
    expect(formatMinutes(120)).toBe("2 orë");
  });
});
