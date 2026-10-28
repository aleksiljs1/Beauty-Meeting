"use client";

import { Controller, type UseFormReturn } from "react-hook-form";
import { FormField } from "@/components/admin/form-field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { admin } from "@/i18n/admin";
import { GENDERS, type StudentProfileInput } from "@/lib/student-profile";
import { todayInAcademy } from "@/lib/datetime";

const t = admin.students.profile;
/** Radix Select can't hold "", so "not chosen" travels as this value. */
const NO_GENDER = "none";

type WithProfile = { profile: StudentProfileInput };

/** The optional student details, for any form whose values keep them under `profile`. */
export function StudentProfileFields<T extends WithProfile>({ form: typed }: { form: UseFormReturn<T> }) {
  const form = typed as unknown as UseFormReturn<WithProfile>; // every caller nests the fields under "profile"
  const errors = form.formState.errors.profile;

  return (
    <fieldset className="grid gap-4 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">{t.heading}</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t.phone} error={errors?.phone?.message}>
          <Input type="tel" inputMode="tel" autoComplete="off" {...form.register("profile.phone")} />
        </FormField>
        <FormField label={t.birthDate} error={errors?.birthDate?.message}>
          <Input type="date" max={todayInAcademy()} {...form.register("profile.birthDate")} />
        </FormField>
        <Controller
          control={form.control}
          name="profile.gender"
          render={({ field }) => (
            <FormField label={t.gender}>
              <Select value={field.value || NO_GENDER} onValueChange={(value) => field.onChange(value === NO_GENDER ? "" : value)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_GENDER}>{t.genderNone}</SelectItem>
                  {GENDERS.map((gender) => (
                    <SelectItem key={gender} value={gender}>
                      {t.genders[gender]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}
        />
        <FormField label={t.city} error={errors?.city?.message}>
          <Input autoComplete="off" {...form.register("profile.city")} />
        </FormField>
      </div>
      <FormField label={t.notes} hint={t.notesHint} error={errors?.notes?.message}>
        <Textarea rows={2} {...form.register("profile.notes")} />
      </FormField>
    </fieldset>
  );
}
