"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { adminContent } from "@/i18n/admin-content";
import { common } from "@/i18n/common";
import { apiSend } from "@/lib/api/client";
import { serviceSchema, type ServiceInput } from "@/lib/content-schemas";
import { applyFieldIssues, errorMessage, Field, StatusMessage, type Status } from "./form-bits";
import { ListEditor, type ItemFormProps } from "./list-editor";
import type { AdminService } from "./types";

const t = adminContent.services;

function ServiceForm({ item, onSaved, onCancel }: ItemFormProps<AdminService>) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const { register, control, handleSubmit, formState, setError } = useForm<ServiceInput>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      title: item?.title ?? "",
      description: item?.description ?? "",
      priceText: item?.priceText ?? "",
      isPublished: item?.isPublished ?? true,
    },
  });
  const err = formState.errors;

  const onSubmit = handleSubmit(async (values) => {
    setStatus({ kind: "busy", text: adminContent.status.saving });
    try {
      const saved = item
        ? await apiSend<AdminService>("patch", `/admin/content/services/${item.id}`, values)
        : await apiSend<AdminService>("post", "/admin/content/services", values);
      onSaved(saved);
    } catch (error) {
      applyFieldIssues(error, setError);
      setStatus({ kind: "error", text: errorMessage(error) });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <Field id="service-title" label={t.titleLabel} error={err.title?.message}>
        {(aria) => <Input autoFocus {...aria} {...register("title")} />}
      </Field>
      <Field id="service-description" label={t.description} error={err.description?.message}>
        {(aria) => <Textarea rows={4} {...aria} {...register("description")} />}
      </Field>
      <Field id="service-price" label={t.priceText} hint={t.priceHint} error={err.priceText?.message}>
        {(aria) => <Input {...aria} {...register("priceText")} />}
      </Field>
      <Controller
        control={control}
        name="isPublished"
        render={({ field }) => (
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={field.value} onCheckedChange={field.onChange} />
            {t.isPublished}
          </label>
        )}
      />
      <div className="flex flex-wrap items-center gap-3 border-t pt-5">
        <Button type="submit" size="lg" className="px-5" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? adminContent.status.saving : common.actions.save}
        </Button>
        <Button type="button" variant="outline" size="lg" className="px-5" onClick={onCancel}>
          {common.actions.cancel}
        </Button>
        <StatusMessage status={status} />
      </div>
    </form>
  );
}

export function ServicesEditor({ initial }: { initial: AdminService[] }) {
  return (
    <ListEditor<AdminService>
      initial={initial}
      endpoint="/admin/content/services"
      publishField="isPublished"
      labels={{ ...t, publishToggle: adminContent.status.published }}
      summary={(s) => [s.priceText, s.description].filter(Boolean).join(" · ") || "—"}
      renderForm={(props) => <ServiceForm {...props} />}
    />
  );
}
