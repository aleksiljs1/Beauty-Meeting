import { describe, expect, it } from "vitest";
import { formatLead, leadMinutes, reminderSettingsSchema, splitLead } from "./admin-reminders";

describe("admin lesson reminder", () => {
  it("words the lead time in Albanian", () => {
    expect(formatLead(1)).toBe("1 minutë");
    expect(formatLead(45)).toBe("45 minuta");
    expect(formatLead(60)).toBe("1 orë");
    expect(formatLead(150)).toBe("2 orë e 30 minuta");
    expect(formatLead(61)).toBe("1 orë e 1 minutë");
  });

  it("shows whole hours as hours and converts back", () => {
    expect(splitLead(120)).toEqual({ value: 2, unit: "hours" });
    expect(splitLead(90)).toEqual({ value: 90, unit: "minutes" });
    expect(splitLead(30)).toEqual({ value: 30, unit: "minutes" });
    expect(leadMinutes(2, "hours")).toBe(120);
    expect(leadMinutes(1.5, "hours")).toBe(90);
    expect(leadMinutes(15, "minutes")).toBe(15);
  });

  it("accepts 5 minutes to 24 hours and an optional email", () => {
    expect(reminderSettingsSchema.safeParse({ enabled: true, minutes: 5, email: "" }).success).toBe(true);
    expect(reminderSettingsSchema.safeParse({ enabled: true, minutes: 1440, email: "ana@example.com" }).success).toBe(true);
    expect(reminderSettingsSchema.safeParse({ enabled: true, minutes: 4, email: "" }).success).toBe(false);
    expect(reminderSettingsSchema.safeParse({ enabled: true, minutes: 1441, email: "" }).success).toBe(false);
    expect(reminderSettingsSchema.safeParse({ enabled: true, minutes: 30, email: "jo-email" }).success).toBe(false);
  });
});
