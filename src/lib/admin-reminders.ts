import { z } from "zod";

/**
 * The admin's email reminder before lessons: settings rules and the Albanian wording of the lead
 * time, shared by the settings form and the email. No I/O — unit-tested.
 */

export const REMINDER_MIN_MINUTES = 5;
export const REMINDER_MAX_MINUTES = 24 * 60;

export const reminderSettingsSchema = z.object({
  enabled: z.boolean(),
  minutes: z
    .int("Shkruani një numër të plotë.")
    .min(REMINDER_MIN_MINUTES, `Të paktën ${REMINDER_MIN_MINUTES} minuta.`)
    .max(REMINDER_MAX_MINUTES, "Jo më shumë se 24 orë."),
  /** Empty: the admin's account email. */
  email: z.union([z.literal(""), z.email("Shkruani një email të vlefshëm.").max(200)]),
});
export type ReminderSettings = z.infer<typeof reminderSettingsSchema>;

export type LeadUnit = "minutes" | "hours";

/** How the form shows a stored lead time: whole hours as hours, anything else in minutes. */
export function splitLead(minutes: number): { value: number; unit: LeadUnit } {
  return minutes >= 60 && minutes % 60 === 0 ? { value: minutes / 60, unit: "hours" } : { value: minutes, unit: "minutes" };
}

export const leadMinutes = (value: number, unit: LeadUnit) => (unit === "hours" ? Math.round(value * 60) : Math.round(value));

/** "1 minutë", "45 minuta", "1 orë", "2 orë e 30 minuta". */
export function formatLead(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const min = (n: number) => `${n} ${n === 1 ? "minutë" : "minuta"}`;
  if (!hours) return min(rest);
  return rest ? `${hours} orë e ${min(rest)}` : `${hours} orë`;
}
