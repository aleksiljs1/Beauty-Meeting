"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { CheckList } from "@/components/admin/check-list";
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
import { ApiClientError, apiGet, apiSend } from "@/lib/api/client";
import {
  defaultSchedule,
  MAX_REPEATED_LESSONS,
  needsEarlyDeadlineConfirmation,
  repeatSchedules,
  scheduleMessages,
  suggestedStart,
  validateLessonSchedule,
  type LessonSchedule,
  type RepeatRule,
} from "@/lib/admin/lesson-rules";
import { academyDay, ACADEMY_TIMEZONE_LABEL, addMonths, formatDate, fromZonedInputValue, timezoneAbbreviation, toZonedInputValue, weekdayIndex } from "@/lib/datetime";
import { cn } from "@/lib/utils";
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
  const courseId = useWatch({ control: form.control, name: "courseId" });
  const courseStudents = useCourseStudents(isEdit || courseId === NO_COURSE ? null : courseId);
  const [repeat, setRepeat] = useState<RepeatRule | null>(null);
  const firstStart = fromZonedInputValue(startValue);
  const repeated = repeat && firstStart ? repeatSchedules(defaultSchedule(firstStart), repeat) : null;
  const repeatProblem = !repeat ? null : !repeat.weekdays.length ? t.repeat.noWeekday : repeated && repeated.length > MAX_REPEATED_LESSONS ? t.repeat.tooMany(MAX_REPEATED_LESSONS) : null;

  function toggleRepeat(on: boolean) {
    const day = academyDay(firstStart ?? new Date());
    setRepeat(on ? { weekdays: [weekdayIndex(day)], until: addMonths(day, 1) } : null);
  }

  /** New lessons: keep join-open, end and deadline following the start until the admin edits them. */
  function onStartChange(value: string) {
    const start = fromZonedInputValue(value);
    const previousStart = fromZonedInputValue(lastStart);
    if (start) setLastStart(value);
    if (isEdit || !start || !previousStart) return;
    if (repeat) setRepeat(followStartDay(repeat, weekdayIndex(academyDay(previousStart)), weekdayIndex(academyDay(start))));
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
      ...(isEdit ? {} : { studentIds: courseStudents.status === "done" ? [...courseStudents.selected] : [] }),
      ...(repeat && !isEdit ? { repeat } : {}),
    };
    try {
      if (lesson) {
        const { zoomWarning } = await apiSend<{ zoomWarning: string | null }>("patch", `/admin/lessons/${lesson.id}`, body);
        // Saved either way; the warning says Zoom still has the old title/time.
        if (zoomWarning) toast.warning(zoomWarning);
        else toast.success(t.saved);
        form.reset(values);
        router.refresh();
      } else {
        const created = await apiSend<{ id: string; enrolled: number; count: number }>("post", "/admin/lessons", body);
        if (created.count > 1) {
          toast.success(t.repeat.created(created.count));
          router.push(`/admin/kalendari?muaji=${values.scheduledStartAt.slice(0, 7)}`);
        } else {
          toast.success(created.enrolled ? t.createdWithStudents(created.enrolled) : t.created);
          router.push(`/admin/mesimet/${created.id}`);
        }
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
    if (repeatProblem) return;
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
        {courseStudents.status !== "idle" && <CourseStudentsField state={courseStudents} />}
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
        {!isEdit && <RepeatField rule={repeat} onToggle={toggleRepeat} onChange={setRepeat} startDay={firstStart && weekdayIndex(academyDay(firstStart))} schedules={repeated ?? []} problem={repeatProblem} />}
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
        {/* While the course's students load, wait: creating now would add nobody. */}
        <Button type="submit" disabled={isSubmitting || (isEdit && !form.formState.isDirty) || courseStudents.status === "loading"}>
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

/**
 * The first lesson always happens on its own start day, so that weekday stays selected; when the
 * start moves to another weekday, a rule that only had the old one follows it.
 */
function followStartDay(rule: RepeatRule, from: number, to: number): RepeatRule {
  if (from === to) return rule;
  const weekdays = rule.weekdays.length === 1 && rule.weekdays[0] === from ? [to] : [...new Set([...rule.weekdays, to])];
  return { ...rule, weekdays };
}

const PREVIEW_DATES = 4;

function RepeatField({
  rule,
  onToggle,
  onChange,
  startDay,
  schedules,
  problem,
}: {
  rule: RepeatRule | null;
  onToggle: (on: boolean) => void;
  onChange: (rule: RepeatRule) => void;
  /** Weekday of the first lesson (always included), when the start is set. */
  startDay: number | null;
  schedules: LessonSchedule[];
  problem: string | null;
}) {
  const r = t.repeat;
  const toggleDay = (day: number) =>
    rule && onChange({ ...rule, weekdays: rule.weekdays.includes(day) ? rule.weekdays.filter((d) => d !== day) : [...rule.weekdays, day] });
  const dates = schedules.slice(0, PREVIEW_DATES).map((s) => formatDate(s.scheduledStartAt));
  const last = schedules.length > PREVIEW_DATES ? formatDate(schedules.at(-1)!.scheduledStartAt) : null;

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <label htmlFor="lesson-repeat" className="text-sm font-medium">
            {r.toggle}
          </label>
          <p className="text-xs text-muted-foreground">{r.hint}</p>
        </div>
        <Switch id="lesson-repeat" checked={!!rule} onCheckedChange={onToggle} />
      </div>
      {rule && (
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">{r.weekdays}</legend>
            <div className="flex flex-wrap gap-1.5">
              {admin.calendar.weekdays.map((name, day) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={rule.weekdays.includes(day) || day === startDay}
                  disabled={day === startDay}
                  title={day === startDay ? r.startDay : undefined}
                  onClick={() => toggleDay(day)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    rule.weekdays.includes(day) || day === startDay ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
          </fieldset>
          <FormField label={r.until}>
            <Input type="date" value={rule.until} onChange={(e) => e.target.value && onChange({ ...rule, until: e.target.value })} />
          </FormField>
          <p className={cn("text-sm sm:col-span-2", problem ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
            {problem ?? (dates.length > 0 && r.preview(schedules.length, dates, last))}
          </p>
        </div>
      )}
    </div>
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

type CourseStudent = { id: string; name: string; email: string };
type CourseStudentsState = {
  status: "idle" | "loading" | "done" | "error";
  students: CourseStudent[];
  selected: ReadonlySet<string>;
  setSelected: (next: Set<string>) => void;
};

/** New lessons: the chosen course's active students, all pre-selected. Changing the course reloads them. */
function useCourseStudents(courseId: string | null): CourseStudentsState {
  const [loaded, setLoaded] = useState<{ courseId: string; status: "done" | "error"; students: CourseStudent[] } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    apiGet<CourseStudent[]>(`/admin/courses/${courseId}/students`)
      .then((students) => {
        if (cancelled) return;
        setLoaded({ courseId, status: "done", students });
        setSelected(new Set(students.map((s) => s.id)));
      })
      .catch(() => !cancelled && setLoaded({ courseId, status: "error", students: [] }));
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  if (!courseId) return { status: "idle", students: [], selected, setSelected };
  if (loaded?.courseId !== courseId) return { status: "loading", students: [], selected, setSelected };
  return { status: loaded.status, students: loaded.students, selected, setSelected };
}

function CourseStudentsField({ state }: { state: CourseStudentsState }) {
  const c = t.courseStudents;
  if (state.status === "loading") return <p className="text-sm text-muted-foreground">{c.loading}</p>;
  if (state.status === "error") return <p className="text-sm text-destructive">{c.error}</p>;
  if (!state.students.length) return <p className="text-sm text-muted-foreground">{c.empty}</p>;
  return (
    <CheckList
      legend={`${c.legend} · ${c.selected(state.selected.size, state.students.length)}`}
      items={state.students.map((s) => ({ id: s.id, label: s.name, description: s.email }))}
      selected={state.selected}
      onChange={state.setSelected}
      shortcuts
      footer={<p className="text-xs text-muted-foreground">{c.hint}</p>}
    />
  );
}
