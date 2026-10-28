import { z } from "zod";
import { admin } from "@/i18n/admin";
import { fromDbDate, isCalendarDay, todayInAcademy } from "./datetime";

/**
 * Optional student details, shared by the admin forms and the API. Every field is a plain
 * string ("" = not given) so forms stay simple; the server stores "" as null.
 */

const v = admin.students.profile.validation;

export const GENDERS = ["FEMALE", "MALE", "OTHER"] as const;

const text = (max: number) => z.string().trim().max(max, v.tooLong);

export const studentProfileSchema = z.object({
  phone: text(40).refine((value) => value === "" || /^\+?[\d\s()-]{6,}$/.test(value), v.phone),
  /** "YYYY-MM-DD"; age is worked out from it, so it never goes stale. */
  birthDate: text(10).refine((value) => value === "" || (isCalendarDay(value) && value >= "1900-01-01" && value <= todayInAcademy()), v.birthDate),
  gender: z.union([z.literal(""), z.enum(GENDERS)]),
  city: text(100),
  /** Only admins see this. */
  notes: text(2_000),
});
export type StudentProfileInput = z.infer<typeof studentProfileSchema>;

export const emptyStudentProfile: StudentProfileInput = { phone: "", birthDate: "", gender: "", city: "", notes: "" };

/** Whole years between `birthDate` and `today` (both "YYYY-MM-DD"). */
export function ageOn(birthDate: string, today: string): number {
  const years = Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4));
  return today.slice(5) < birthDate.slice(5) ? years - 1 : years;
}

/** Stored profile → form values ("" for anything not given). */
export function toProfileInput(profile: { phone: string | null; birthDate: Date | null; gender: StudentProfileInput["gender"] | null; city: string | null; notes: string | null } | null): StudentProfileInput {
  return {
    phone: profile?.phone ?? "",
    birthDate: profile?.birthDate ? fromDbDate(profile.birthDate) : "",
    gender: profile?.gender ?? "",
    city: profile?.city ?? "",
    notes: profile?.notes ?? "",
  };
}
