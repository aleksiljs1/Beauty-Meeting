"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { adminContent } from "@/i18n/admin-content";
import { common } from "@/i18n/common";
import { apiSend } from "@/lib/api/client";
import { settingsSchema, type SettingsInput } from "@/lib/content-schemas";
import { applyFieldIssues, errorMessage, Field, StatusMessage, type Status } from "./form-bits";

const t = adminContent.settings;

export function SettingsForm({ initial }: { initial: SettingsInput }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const form = useForm<SettingsInput>({ resolver: zodResolver(settingsSchema), defaultValues: initial });
  const { register, control, handleSubmit, formState, setError, reset } = form;
  const hours = useFieldArray({ control, name: "openingHours" });
  const err = formState.errors;

  const onSubmit = handleSubmit(async (values) => {
    setStatus({ kind: "busy", text: adminContent.status.saving });
    try {
      const saved = await apiSend<SettingsInput>("put", "/admin/content/settings", values);
      reset(saved);
      setStatus({ kind: "ok", text: adminContent.status.saved });
    } catch (error) {
      applyFieldIssues(error, setError);
      setStatus({ kind: "error", text: errorMessage(error) });
    }
  });

  const text = (name: Exclude<keyof SettingsInput, "openingHours">, label: string, hint?: string, type = "text") => (
    <Field id={`settings-${name}`} label={label} hint={hint} error={err[name]?.message}>
      {(aria) => <Input type={type} {...aria} {...register(name)} />}
    </Field>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-3xl gap-10">
      <fieldset className="grid gap-5">
        {text("name", t.name)}
        {text("tagline", t.tagline, t.taglineHint)}
        <Field id="settings-about" label={t.about} hint={t.aboutHint} error={err.about?.message}>
          {(aria) => <Textarea rows={8} {...aria} {...register("about")} />}
        </Field>
      </fieldset>

      <fieldset className="grid gap-5">
        <legend className="mb-4 font-heading text-2xl">{t.contactHeading}</legend>
        {text("address", t.address)}
        <div className="grid gap-5 sm:grid-cols-2">
          {text("phone", t.phone, undefined, "tel")}
          {text("email", t.email, undefined, "email")}
        </div>
        {text("whatsapp", t.whatsapp, t.whatsappHint, "tel")}
        {text("mapUrl", t.mapUrl, t.mapUrlHint, "url")}
      </fieldset>

      <fieldset className="grid gap-5">
        <legend className="mb-4 font-heading text-2xl">{t.socialHeading}</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          {text("instagramUrl", t.instagramUrl, undefined, "url")}
          {text("facebookUrl", t.facebookUrl, undefined, "url")}
        </div>
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="mb-4 font-heading text-2xl">{t.hoursHeading}</legend>
        {hours.fields.length === 0 && <p className="text-sm text-muted-foreground">{t.noHours}</p>}
        {hours.fields.map((row, index) => (
          <div key={row.id} className="grid items-end gap-3 rounded-md border p-4 sm:grid-cols-[1fr_1fr_auto] sm:border-0 sm:p-0">
            <Field id={`hours-${index}-days`} label={t.hoursDays} error={err.openingHours?.[index]?.days?.message}>
              {(aria) => <Input placeholder={t.hoursDaysPlaceholder} {...aria} {...register(`openingHours.${index}.days`)} />}
            </Field>
            <Field id={`hours-${index}-hours`} label={t.hoursHours} error={err.openingHours?.[index]?.hours?.message}>
              {(aria) => <Input placeholder={t.hoursHoursPlaceholder} {...aria} {...register(`openingHours.${index}.hours`)} />}
            </Field>
            <Button type="button" variant="ghost" size="icon-lg" onClick={() => hours.remove(index)} aria-label={`${t.removeHoursRow} ${index + 1}`}>
              <Trash2Icon aria-hidden />
            </Button>
          </div>
        ))}
        {err.openingHours?.message && <p className="text-xs text-destructive">{err.openingHours.message}</p>}
        <div>
          <Button type="button" variant="outline" onClick={() => hours.append({ days: "", hours: "" })} disabled={hours.fields.length >= 14}>
            <PlusIcon aria-hidden />
            {t.addHoursRow}
          </Button>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-4 border-t pt-6">
        <Button type="submit" size="lg" className="px-6" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? adminContent.status.saving : common.actions.save}
        </Button>
        <StatusMessage status={status} />
      </div>
    </form>
  );
}
