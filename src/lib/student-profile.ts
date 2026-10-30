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

/** Longest phone number written out: 15 digits (the international maximum) plus separators. */
export const PHONE_MAX_LENGTH = 22;

/**
 * A phone number as people write it: an optional international prefix ("+" or "00"), then 7–15
 * digits (15 is the international maximum, prefix included) with spaces, dots, dashes or brackets
 * between them. E.g. "+355 69 123 4567", "0691234567", "(04) 222-333".
 */
export function isPhoneNumber(value: string): boolean {
  if (value.length > PHONE_MAX_LENGTH || !/^(\+|00)?[\d\s().-]+$/.test(value)) return false;
  const digits = value.replace(/^\+|^00/, "").replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

export const studentProfileSchema = z.object({
  phone: text(PHONE_MAX_LENGTH).refine((value) => value === "" || isPhoneNumber(value), v.phone),
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
