"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { DateInput } from "@/components/admin/date-inputs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { adminContent } from "@/i18n/admin-content";
import { common } from "@/i18n/common";
import { ApiClientError, apiSend } from "@/lib/api/client";
import { centsToEuroInput } from "@/lib/billing";
import { courseSchema, type CourseInput } from "@/lib/content-schemas";
import { slugify } from "@/lib/public-content";
import { applyFieldIssues, errorMessage, Field, StatusMessage, type Status } from "./form-bits";
import { ListEditor, type ItemFormProps } from "./list-editor";
import type { AdminCourse } from "./types";

const t = adminContent.courses;

function CourseForm({ item, onSaved, onCancel }: ItemFormProps<AdminCourse>) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // New courses follow the title until the slug is edited by hand; existing slugs never change on their own.
  const [slugEdited, setSlugEdited] = useState(Boolean(item));
  const { register, control, handleSubmit, formState, setError, setValue } = useForm<CourseInput>({
    resolver: zodResolver(courseSchema),
    defaultValues: {
      title: item?.title ?? "",
      slug: item?.slug ?? "",
      summary: item?.summary ?? "",
      description: item?.description ?? "",
      durationText: item?.durationText ?? "",
      priceText: item?.priceText ?? "",
      isPublic: item?.isPublic ?? false,
      startsOn: item?.startsOn ?? "",
      duration: {
        years: item?.durationMonths ? String(Math.floor(item.durationMonths / 12)) : "",
        months: item?.durationMonths ? String(item.durationMonths % 12) : "",
      },
      monthlyPrice: item?.monthlyPriceCents != null ? centsToEuroInput(item.monthlyPriceCents) : "",
    },
  });
  const err = formState.errors;

  const titleField = register("title", {
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!slugEdited) setValue("slug", slugify(event.target.value), { shouldValidate: formState.isSubmitted });
    },
  });
  const slugField = register("slug", {
    onChange: () => setSlugEdited(true),
  });

  const onSubmit = handleSubmit(async (values) => {
    setStatus({ kind: "busy", text: adminContent.status.saving });
    try {
      const saved = item
        ? await apiSend<AdminCourse>("patch", `/admin/content/courses/${item.id}`, values)
        : await apiSend<AdminCourse>("post", "/admin/content/courses", values);
      onSaved(saved);
    } catch (error) {
      applyFieldIssues(error, setError);
      if (error instanceof ApiClientError && error.code === "CONFLICT") setError("slug", { type: "server", message: error.message });
      setStatus({ kind: "error", text: errorMessage(error) });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <Field id="course-title" label={t.titleLabel} error={err.title?.message}>
        {(aria) => <Input autoFocus {...aria} {...titleField} />}
      </Field>
      <Field id="course-slug" label={t.slug} hint={t.slugHint} error={err.slug?.message}>
        {(aria) => <Input spellCheck={false} autoCapitalize="none" {...aria} {...slugField} />}
      </Field>
      <Field id="course-summary" label={t.summary} hint={t.summaryHint} error={err.summary?.message}>
        {(aria) => <Textarea rows={2} {...aria} {...register("summary")} />}
      </Field>
      <Field id="course-description" label={t.description} hint={adminContent.settings.aboutHint} error={err.description?.message}>
        {(aria) => <Textarea rows={8} {...aria} {...register("description")} />}
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="course-duration" label={t.durationText} hint={t.durationHint} error={err.durationText?.message}>
          {(aria) => <Input {...aria} {...register("durationText")} />}
        </Field>
        <Field id="course-price" label={t.priceText} error={err.priceText?.message}>
          {(aria) => <Input {...aria} {...register("priceText")} />}
        </Field>
      </div>
      <fieldset className="grid gap-4 rounded-md border p-4">
        <legend className="px-1 text-sm font-medium">{t.billingHeading}</legend>
        <p className="text-sm text-muted-foreground">{t.billingHint}</p>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field id="course-starts-on" label={t.startsOn} error={err.startsOn?.message}>
            {(aria) => <Controller control={control} name="startsOn" render={({ field }) => <DateInput {...aria} {...field} />} />}
          </Field>
          <Field id="course-years" label={t.durationYears} error={err.duration?.years?.message}>
            {(aria) => <Input inputMode="numeric" {...aria} {...register("duration.years")} />}
          </Field>
          <Field id="course-months" label={t.durationMonths} error={err.duration?.months?.message}>
            {(aria) => <Input inputMode="numeric" {...aria} {...register("duration.months")} />}
          </Field>
          <Field id="course-monthly-price" label={t.monthlyPrice} error={err.monthlyPrice?.message}>
            {(aria) => <Input inputMode="decimal" {...aria} {...register("monthlyPrice")} />}
          </Field>
        </div>
      </fieldset>
      <Controller
        control={control}
        name="isPublic"
        render={({ field }) => (
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={field.value} onCheckedChange={field.onChange} />
            {t.isPublic}
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

export function CoursesEditor({ initial }: { initial: AdminCourse[] }) {
  return (
    <ListEditor<AdminCourse>
      initial={initial}
      endpoint="/admin/content/courses"
      publishField="isPublic"
      labels={{ ...t, publishToggle: adminContent.status.published }}
      summary={(c) => (
        <>
          <span className="font-mono text-xs">/akademia/{c.slug}</span>
          {c.summary && <span> · {c.summary}</span>}
        </>
      )}
      renderForm={(props) => <CourseForm {...props} />}
      deleteOption={(c) => (c.lessonCount ? { label: t.deleteLessons(c.lessonCount), param: "mesimet" } : null)}
    />
  );
}
