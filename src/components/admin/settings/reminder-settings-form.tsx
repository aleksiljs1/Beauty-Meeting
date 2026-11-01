"use client";

import { useState } from "react";
import { FormField } from "@/components/admin/form-field";
import { useApiAction } from "@/components/admin/use-api-action";
import { LabelRow } from "@/components/info-tip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { admin } from "@/i18n/admin";
import { fieldInfo } from "@/i18n/field-info";
import { apiSend } from "@/lib/api/client";
import { formatLead, leadMinutes, reminderSettingsSchema, splitLead, type LeadUnit, type ReminderSettings } from "@/lib/admin-reminders";
import { cn } from "@/lib/utils";

const t = admin.preferences.reminder;
const PRESETS = [15, 30, 60, 180, 1440];

/** The admin's email reminder before lessons: on/off, how long before, and where it goes. */
export function ReminderSettingsForm({ initial, accountEmail }: { initial: ReminderSettings; accountEmail: string }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [lead, setLead] = useState(() => {
    const split = splitLead(initial.minutes);
    return { value: String(split.value), unit: split.unit };
  });
  const [email, setEmail] = useState(initial.email);
  const [errors, setErrors] = useState<{ minutes?: string; email?: string }>({});
  const { run, pending } = useApiAction();

  const minutes = leadMinutes(Number(lead.value.replace(",", ".")), lead.unit);
  const valid = Number.isFinite(minutes) && minutes > 0;

  async function save() {
    // Switched off, the greyed-out fields can't block saving: an unusable value keeps the saved one.
    const usable = <K extends "minutes" | "email">(key: K, value: ReminderSettings[K]) =>
      enabled || reminderSettingsSchema.shape[key].safeParse(value).success ? value : initial[key];
    const parsed = reminderSettingsSchema.safeParse({ enabled, minutes: usable("minutes", minutes), email: usable("email", email.trim()) });
    if (!parsed.success) {
      const issue = (path: string) => parsed.error.issues.find((i) => i.path[0] === path)?.message;
      return setErrors({ minutes: issue("minutes"), email: issue("email") });
    }
    setErrors({});
    await run(() => apiSend("put", "/admin/preferences/reminders", parsed.data), { success: t.saved, refresh: false });
  }

  return (
    <form
      noValidate
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="flex items-center gap-3">
        <Switch id="reminder-enabled" checked={enabled} onCheckedChange={setEnabled} />
        <LabelRow info={fieldInfo.reminder.toggle} infoLabel={t.toggle}>
          <Label htmlFor="reminder-enabled">{t.toggle}</Label>
        </LabelRow>
      </div>

      <fieldset disabled={!enabled} className="grid gap-5 disabled:opacity-60">
        <div className="space-y-1.5">
          <LabelRow info={fieldInfo.reminder.lead} infoLabel={t.lead}>
            <Label htmlFor="reminder-lead">{t.lead}</Label>
          </LabelRow>
          <div className="flex gap-2">
            <Input
              id="reminder-lead"
              inputMode="numeric"
              autoComplete="off"
              className="w-24"
              value={lead.value}
              aria-invalid={errors.minutes ? true : undefined}
              aria-describedby={errors.minutes ? "reminder-lead-error" : undefined}
              onChange={(event) => setLead({ ...lead, value: event.target.value.replace(/[^\d.,]/g, "") })}
            />
            <Select value={lead.unit} onValueChange={(unit) => setLead({ ...lead, unit: unit as LeadUnit })} disabled={!enabled}>
              <SelectTrigger className="w-32" aria-label={t.unit}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minutes">{t.units.minutes}</SelectItem>
                <SelectItem value="hours">{t.units.hours}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {errors.minutes && (
            <p id="reminder-lead-error" className="text-xs text-destructive">
              {errors.minutes}
            </p>
          )}
          <div role="group" aria-label={t.presets} className="flex flex-wrap gap-1.5 pt-1">
            {PRESETS.map((preset) => {
              const split = splitLead(preset);
              const active = valid && minutes === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setLead({ value: String(split.value), unit: split.unit })}
                  className={cn(
                    "h-8 rounded-full border px-3 text-xs transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    active ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted",
                  )}
                >
                  {formatLead(preset)}
                </button>
              );
            })}
          </div>
        </div>

        <FormField label={t.email} hint={t.emailHint(accountEmail)} info={fieldInfo.reminder.email} error={errors.email} className="max-w-md">
          <Input type="email" inputMode="email" autoComplete="email" placeholder={accountEmail} value={email} onChange={(event) => setEmail(event.target.value)} />
        </FormField>
      </fieldset>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {enabled ? (valid ? t.summaryOn(formatLead(minutes)) : null) : t.summaryOff}
      </p>

      <div>
        <Button type="submit" disabled={pending}>
          {t.save}
        </Button>
      </div>
    </form>
  );
}
