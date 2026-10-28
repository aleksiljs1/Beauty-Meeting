import { describe, expect, it } from "vitest";
import { billingSummary, courseMonthAt, courseMonthLabel, joiningMonth, parseEuroCents } from "./billing";
import { addMonths } from "./datetime";

const course = { startsOn: "2026-11-01", durationMonths: 26, monthlyPriceCents: 4000 };

describe("course months", () => {
  it("counts months from the course start, clamping short months", () => {
    expect(courseMonthAt(course.startsOn, "2026-10-31")).toBe(0);
    expect(courseMonthAt(course.startsOn, "2026-11-01")).toBe(1);
    expect(courseMonthAt(course.startsOn, "2026-12-01")).toBe(2);
    expect(courseMonthAt(course.startsOn, "2027-11-30")).toBe(13);
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(courseMonthAt("2026-01-31", "2026-02-27")).toBe(1);
    expect(courseMonthAt("2026-01-31", "2026-02-28")).toBe(2);
  });

  it("labels months as year and month of the course", () => {
    expect(courseMonthLabel(2)).toEqual({ year: 1, month: 2 });
    expect(courseMonthLabel(12)).toEqual({ year: 1, month: 12 });
    expect(courseMonthLabel(14)).toEqual({ year: 2, month: 2 });
  });

  it("starts a late joiner in the current month, never outside the course", () => {
    expect(joiningMonth(course, "2026-10-01")).toBe(1);
    expect(joiningMonth(course, "2026-12-15")).toBe(2);
    expect(joiningMonth(course, "2030-01-01")).toBe(26);
  });
});

describe("billing summary", () => {
  it("student 1: joined in month 2 and paid one month", () => {
    const s = billingSummary(course, { firstMonth: 2, monthsPaid: 1 }, "2026-12-10");
    expect(s).toMatchObject({ status: "PAID", paidThroughMonth: 2, paidUntil: "2026-12-31", nextDueOn: "2027-01-01", monthsOwed: 0, monthsLeft: 24 });
    expect(billingSummary(course, { firstMonth: 2, monthsPaid: 1 }, "2026-12-28").status).toBe("DUE_SOON");

    const late = billingSummary(course, { firstMonth: 2, monthsPaid: 1 }, "2027-02-03");
    expect(late).toMatchObject({ status: "OVERDUE", monthsOwed: 2, amountOwedCents: 8000, nextDueOn: "2027-01-01" });
  });

  it("student 2: paid a year from the start", () => {
    const s = billingSummary(course, { firstMonth: 1, monthsPaid: 12 }, "2027-03-01");
    expect(s).toMatchObject({ status: "PAID", paidThroughMonth: 12, paidUntil: "2027-10-31", monthsLeft: 14, amountLeftCents: 56000 });
  });

  it("nothing is owed before the course starts, and nothing after everything is paid", () => {
    expect(billingSummary(course, { firstMonth: 1, monthsPaid: 0 }, "2026-10-01")).toMatchObject({ status: "PAID", monthsOwed: 0, paidUntil: null });
    expect(billingSummary(course, { firstMonth: 1, monthsPaid: 26 }, "2029-01-01")).toMatchObject({ status: "COMPLETE", monthsOwed: 0, nextDueOn: null });
  });

  it("leaves amounts empty when the course has no price", () => {
    const s = billingSummary({ ...course, monthlyPriceCents: null }, { firstMonth: 1, monthsPaid: 0 }, "2026-11-05");
    expect(s).toMatchObject({ status: "OVERDUE", monthsOwed: 1, amountOwedCents: null });
  });
});

describe("euro input", () => {
  it("accepts comma or dot decimals and rejects anything else", () => {
    expect(parseEuroCents("40")).toBe(4000);
    expect(parseEuroCents("40,5")).toBe(4050);
    expect(parseEuroCents("1200.99")).toBe(120099);
    expect(parseEuroCents("-3")).toBeNull();
    expect(parseEuroCents("4,555")).toBeNull();
  });
});
