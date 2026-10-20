import { describe, expect, it } from "vitest";
import { formatCountdown, grantRenewDelayMs, MAX_BACKOFF_MS, nextPollDelay, SAFETY_POLL_MS } from "./polling";

describe("nextPollDelay", () => {
  const noJitter = () => 0;

  it("uses the slow 120 s safety poll while healthy (realtime does the rest)", () => {
    expect(SAFETY_POLL_MS).toBe(120_000);
    expect(nextPollDelay(0)).toBe(SAFETY_POLL_MS);
    expect(nextPollDelay(-1)).toBe(SAFETY_POLL_MS);
  });

  it("backs off exponentially after failures", () => {
    expect(nextPollDelay(1, noJitter)).toBe(20_000);
    expect(nextPollDelay(2, noJitter)).toBe(40_000);
    expect(nextPollDelay(3, noJitter)).toBe(80_000);
  });

  it("caps the backoff at two minutes", () => {
    expect(nextPollDelay(4, noJitter)).toBe(MAX_BACKOFF_MS);
    expect(nextPollDelay(50, noJitter)).toBe(MAX_BACKOFF_MS);
  });

  it("applies at most 10 % jitter, never above the cap", () => {
    const delay = nextPollDelay(5, () => 0.999);
    expect(delay).toBeLessThanOrEqual(MAX_BACKOFF_MS);
    expect(delay).toBeGreaterThanOrEqual(MAX_BACKOFF_MS * 0.9);
  });
});

describe("grantRenewDelayMs", () => {
  it("renews 30 s before a 5-minute grant expires", () => {
    expect(grantRenewDelayMs(300)).toBe(270_000);
  });

  it("renews at 80 % of short grants", () => {
    expect(grantRenewDelayMs(60)).toBe(48_000);
  });

  it("never schedules a renewal sooner than 5 s", () => {
    expect(grantRenewDelayMs(1)).toBe(5_000);
    expect(grantRenewDelayMs(0)).toBe(5_000);
  });
});

describe("formatCountdown", () => {
  it("formats seconds, minutes, hours and days", () => {
    expect(formatCountdown(45)).toBe("45 s");
    expect(formatCountdown(14 * 60 + 3)).toBe("14 min 03 s");
    expect(formatCountdown(2 * 3600 + 5 * 60)).toBe("2 orë 05 min");
    expect(formatCountdown(3 * 86_400 + 4 * 3600)).toBe("3 ditë 4 orë");
    expect(formatCountdown(-10)).toBe("0 s");
  });
});
