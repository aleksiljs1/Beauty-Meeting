"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { FormField } from "@/components/admin/form-field";
import { errorMessage } from "@/components/admin/use-api-action";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, apiSend } from "@/lib/api/client";
import {
  defaultSchedule,
  needsEarlyDeadlineConfirmation,
  scheduleMessages,
  suggestedStart,
  validateLessonSchedule,
  type LessonSchedule,
} from "@/lib/admin/lesson-rules";
import { ACADEMY_TIMEZONE_LABEL, fromZonedInputValue, timezoneAbbreviation, toZonedInputValue } from "@/lib/datetime";
import { admin } from "@/i18n/admin";
import { common } from "@/i18n/common";

const t = admin.lessonForm;
const NO_COURSE = "__none";
const SCHEDULE_FIELDS = ["scheduledStartAt", "scheduledEndAt", "joinOpensAt", "accessExpiresAt"] as const;

const dateField = z.string().refine((value) => fromZonedInputValue(value) !== null, t.validation.date);
const schema = z.object({
  title: z.string().trim().min(2, t.validation.title).max(200, t.validation.title),
  summary: z.string().max(1_000, t.validation.long),
  details: z.string().max(20_000, t.validation.long),
  courseId: z.string(),
  isDemo: z.boolean(),
  scheduledStartAt: dateField,
  scheduledEndAt: dateField,
  joinOpensAt: dateField,
  accessExpiresAt: dateField,
});
type Values = z.infer<typeof schema>;

export type LessonFormLesson = {
  id: string;
  title: string;
  summary: string | null;
  details: string | null;
  courseId: string | null;
  isDemo: boolean;
  publication: "DRAFT" | "PUBLISHED" | "ARCHIVED" | "CANCELLED";
  meetingStatus: string;
} & LessonSchedule;

function toValues(source: LessonSchedule & { title?: string; summary?: string | null; details?: string | null; courseId?: string | null; isDemo?: boolean }): Values {
  return {
    title: source.title ?? "",
    summary: source.summary ?? "",
    details: source.details ?? "",
    courseId: source.courseId ?? NO_COURSE,
    isDemo: source.isDemo ?? false,
    scheduledStartAt: toZonedInputValue(source.scheduledStartAt),
    scheduledEndAt: toZonedInputValue(source.scheduledEndAt),
    joinOpensAt: toZonedInputValue(source.joinOpensAt),
    accessExpiresAt: toZonedInputValue(source.accessExpiresAt),
  };
}

function toSchedule(values: Values): LessonSchedule {
  return {
    scheduledStartAt: fromZonedInputValue(values.scheduledStartAt)!,
    scheduledEndAt: fromZonedInputValue(values.scheduledEndAt)!,
    joinOpensAt: fromZonedInputValue(values.joinOpensAt)!,
    accessExpiresAt: fromZonedInputValue(values.accessExpiresAt)!,
  };
}

export function LessonForm({
  lesson,
  courses,
  demoAllowed,
}: {
  lesson?: LessonFormLesson;
  courses: { id: string; title: string }[];
  demoAllowed: boolean;
}) {
  const router = useRouter();
  const [initial] = useState(() => toValues(lesson ?? defaultSchedule(suggestedStart(new Date()))));
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial });
  const [confirming, setConfirming] = useState<Values | null>(null);
  // Previous start value, so a new lesson keeps its duration when the start moves.
  const [lastStart, setLastStart] = useState(initial.scheduledStartAt);
  const { errors, dirtyFields, isSubmitting } = form.formState;

  const isEdit = !!lesson;
  const scheduleDirty = SCHEDULE_FIELDS.some((field) => dirtyFields[field]);
  const startValue = useWatch({ control: form.control, name: "scheduledStartAt" });
  const zoneAt = fromZonedInputValue(startValue) ?? new Date();

  /** New lessons: keep join-open, end and deadline following the start until the admin edits them. */
  function onStartChange(value: string) {
    const start = fromZonedInputValue(value);
    const previousStart = fromZonedInputValue(lastStart);
    if (start) setLastStart(value);
    if (isEdit || !start || !previousStart) return;
    const currentEnd = fromZonedInputValue(form.getValues("scheduledEndAt"));
    if (!currentEnd) return;
    const durationMs = Math.max(30 * 60_000, currentEnd.getTime() - previousStart.getTime());
    const end = dirtyFields.scheduledEndAt ? currentEnd : new Date(start.getTime() + durationMs);
    const defaults = defaultSchedule(start, end);
    if (!dirtyFields.scheduledEndAt) form.setValue("scheduledEndAt", toZonedInputValue(end));
    if (!dirtyFields.joinOpensAt) form.setValue("joinOpensAt", toZonedInputValue(defaults.joinOpensAt));
    if (!dirtyFields.accessExpiresAt) form.setValue("accessExpiresAt", toZonedInputValue(defaults.accessExpiresAt));
  }

  function onEndChange(value: string) {
    if (isEdit || dirtyFields.accessExpiresAt) return;
    const end = fromZonedInputValue(value);
    if (end) form.setValue("accessExpiresAt", toZonedInputValue(defaultSchedule(end, end).accessExpiresAt));
  }

  function applyIssues(issues: { path: string; message: string }[]) {
    for (const issue of issues) {
      const field = SCHEDULE_FIELDS.find((f) => f === issue.path) ?? (issue.path in initial ? (issue.path as keyof Values) : null);
      if (field) form.setError(field, { message: issue.message });
    }
  }

  async function save(values: Values, confirmEarlyDeadline: boolean) {
    const schedule = toSchedule(values);
    const body = {
      title: values.title,
      summary: values.summary,
      details: values.details,
      courseId: values.courseId === NO_COURSE ? null : values.courseId,
      ...(demoAllowed || isEdit ? { isDemo: values.isDemo } : {}),
      scheduledStartAt: schedule.scheduledStartAt.toISOString(),
      scheduledEndAt: schedule.scheduledEndAt.toISOString(),
      joinOpensAt: schedule.joinOpensAt.toISOString(),
      accessExpiresAt: schedule.accessExpiresAt.toISOString(),
      confirmEarlyDeadline,
    };
    try {
      if (lesson) {
        await apiSend("patch", `/admin/lessons/${lesson.id}`, body);
        toast.success(t.saved);
        form.reset(values);
        router.refresh();
      } else {
        const created = await apiSend<{ id: string }>("post", "/admin/lessons", body);
        toast.success(t.created);
        router.push(`/admin/mesimet/${created.id}`);
      }
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "VALIDATION_FAILED" && error.issues.length) {
        if (needsEarlyDeadlineConfirmation(error.issues)) return setConfirming(values);
        applyIssues(error.issues);
      }
      toast.error(errorMessage(error));
    }
  }

  const submit = form.handleSubmit(async (values) => {
    // Instant feedback with the same rules the server enforces.
    const issues = validateLessonSchedule(toSchedule(values));
    if (needsEarlyDeadlineConfirmation(issues)) return setConfirming(values);
    if (issues.length) return applyIssues(issues);
    await save(values, false);
  });

  const liveLocked = lesson?.meetingStatus === "LIVE";

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <div className="grid gap-4">
        <FormField label={t.title} error={errors.title?.message}>
          <Input autoComplete="off" {...form.register("title")} />
        </FormField>
        <FormField label={t.summary} hint={t.summaryHint} error={errors.summary?.message}>
          <Textarea rows={2} {...form.register("summary")} />
        </FormField>
        <FormField label={t.details} hint={t.detailsHint} error={errors.details?.message}>
          <Textarea rows={5} {...form.register("details")} />
        </FormField>
        {courses.length > 0 && (
          <Controller
            control={form.control}
            name="courseId"
            render={({ field }) => (
              <FormField label={t.course}>
                <SelectTriggerWrapper value={field.value} onChange={field.onChange} courses={courses} />
              </FormField>
            )}
          />
        )}
      </div>

      <fieldset className="space-y-4 rounded-md border p-4">
        <legend className="px-1 text-sm font-medium">{t.scheduleLegend}</legend>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Info className="size-4" aria-hidden /> {t.timezone(ACADEMY_TIMEZONE_LABEL, timezoneAbbreviation(zoneAt))}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t.start} error={errors.scheduledStartAt?.message}>
            <Input type="datetime-local" {...form.register("scheduledStartAt", { onChange: (e) => onStartChange(e.target.value) })} />
          </FormField>
          <FormField label={t.end} error={errors.scheduledEndAt?.message}>
            <Input type="datetime-local" {...form.register("scheduledEndAt", { onChange: (e) => onEndChange(e.target.value) })} />
          </FormField>
          <FormField label={t.joinOpens} hint={t.joinOpensHint} error={errors.joinOpensAt?.message}>
            <Input type="datetime-local" {...form.register("joinOpensAt")} />
          </FormField>
          <FormField label={t.deadline} hint={t.deadlineHint} error={errors.accessExpiresAt?.message}>
            <Input type="datetime-local" {...form.register("accessExpiresAt")} />
          </FormField>
        </div>
        <div aria-live="polite">
          {isEdit && lesson.publication === "PUBLISHED" && scheduleDirty && (
            <Alert>
              <Info aria-hidden />
              <AlertDescription>{t.publishedNote}</AlertDescription>
            </Alert>
          )}
        </div>
      </fieldset>

      {(demoAllowed || lesson?.isDemo) && (
        <Controller
          control={form.control}
          name="isDemo"
          render={({ field }) => (
            <div className="flex items-start justify-between gap-4 rounded-md border p-4">
              <div className="space-y-1">
                <label htmlFor="lesson-is-demo" className="text-sm font-medium">
                  {t.isDemo}
                </label>
                <p className="text-xs text-muted-foreground">{liveLocked ? t.isDemoLocked : t.isDemoHint}</p>
              </div>
              <Switch id="lesson-is-demo" checked={field.value} onCheckedChange={field.onChange} disabled={liveLocked || (!demoAllowed && !field.value)} />
            </div>
          )}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting || (isEdit && !form.formState.isDirty)}>
          {isSubmitting ? common.actions.loading : isEdit ? t.save : t.create}
        </Button>
        {isEdit && form.formState.isDirty && (
          <Button type="button" variant="outline" onClick={() => form.reset()}>
            {common.actions.cancel}
          </Button>
        )}
      </div>

      <AlertDialog open={!!confirming} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.earlyDeadlineTitle}</AlertDialogTitle>
            <AlertDialogDescription>{scheduleMessages.earlyDeadline}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{common.actions.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const values = confirming;
                setConfirming(null);
                if (values) void save(values, true);
              }}
            >
              {t.earlyDeadlineConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

function SelectTriggerWrapper({
  value,
  onChange,
  courses,
  ...aria
}: {
  value: string;
  onChange: (value: string) => void;
  courses: { id: string; title: string }[];
  id?: string;
  "aria-describedby"?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full" {...aria}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_COURSE}>{t.noCourse}</SelectItem>
        {courses.map((course) => (
          <SelectItem key={course.id} value={course.id}>
            {course.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
