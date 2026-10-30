"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Ban, Send, Trash2, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { TimeInput } from "@/components/admin/date-inputs";
import { FormField } from "@/components/admin/form-field";
import { AddStudent } from "@/components/admin/lessons/roster-panel";
import { useApiAction } from "@/components/admin/use-api-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiSend } from "@/lib/api/client";
import { toZonedInputValue } from "@/lib/datetime";
import { admin } from "@/i18n/admin";
import { common } from "@/i18n/common";

const t = admin.series;
const f = admin.lessonForm;
const NO_COURSE = "__none";

/** What the forms start from: the series' next date. */
export type SeriesNext = {
  title: string;
  summary: string | null;
  details: string | null;
  courseId: string | null;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
};

/** Title, texts, course and (optionally) the clock time of every upcoming date. */
export function SeriesEditForm({ seriesId, next, courses }: { seriesId: string; next: SeriesNext; courses: { id: string; title: string }[] }) {
  const [values, setValues] = useState({
    title: next.title,
    summary: next.summary ?? "",
    details: next.details ?? "",
    courseId: next.courseId ?? NO_COURSE,
    start: toZonedInputValue(next.scheduledStartAt).slice(11, 16),
    duration: String(Math.round((next.scheduledEndAt.getTime() - next.scheduledStartAt.getTime()) / 60_000)),
  });
  const [changeTime, setChangeTime] = useState(false);
  const { run, pending } = useApiAction();
  const set = (key: keyof typeof values) => (value: string) => setValues((v) => ({ ...v, [key]: value }));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const body = {
      title: values.title,
      summary: values.summary || null,
      details: values.details || null,
      courseId: values.courseId === NO_COURSE ? null : values.courseId,
      ...(changeTime ? { time: { start: values.start, durationMinutes: Number(values.duration) } } : {}),
    };
    const result = await run(() => apiSend<{ count: number; zoomWarning: string | null }>("patch", `/admin/series/${seriesId}`, body));
    if (!result) return;
    toast.success(t.saved(result.count));
    if (result.zoomWarning) toast.warning(result.zoomWarning);
  }

  return (
    <form onSubmit={save} className="grid gap-4">
      <FormField label={f.title}>
        <Input value={values.title} onChange={(e) => set("title")(e.target.value)} required minLength={2} maxLength={200} />
      </FormField>
      <FormField label={f.summary} hint={f.summaryHint}>
        <Textarea value={values.summary} onChange={(e) => set("summary")(e.target.value)} rows={2} maxLength={1_000} />
      </FormField>
      <FormField label={f.details} hint={f.detailsHint}>
        <Textarea value={values.details} onChange={(e) => set("details")(e.target.value)} rows={4} maxLength={20_000} />
      </FormField>
      <FormField label={f.course}>
        <Select value={values.courseId} onValueChange={set("courseId")}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_COURSE}>{f.noCourse}</SelectItem>
            {courses.map((course) => (
              <SelectItem key={course.id} value={course.id}>
                {course.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <div className="space-y-3 border-t pt-4">
        <label className="flex items-center justify-between gap-4 text-sm font-medium">
          {t.changeTime}
          <Switch checked={changeTime} onCheckedChange={setChangeTime} />
        </label>
        {changeTime && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t.startTime}>
              <TimeInput value={values.start} onChange={set("start")} required />
            </FormField>
            <FormField label={t.duration}>
              <Input type="number" min={15} max={720} step={5} value={values.duration} onChange={(e) => set("duration")(e.target.value)} required />
            </FormField>
          </div>
        )}
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? common.actions.loading : f.save}
        </Button>
      </div>
    </form>
  );
}

/** Publish, cancel and delete for the whole series. */
export function SeriesActions({
  seriesId,
  drafts,
  upcoming,
  total,
}: {
  seriesId: string;
  drafts: number;
  upcoming: number;
  total: number;
}) {
  const router = useRouter();
  const { run, pending } = useApiAction();
  const url = `/admin/series/${seriesId}`;

  async function remove(upcomingOnly: boolean) {
    const result = await run(() => apiSend<{ count: number }>("delete", upcomingOnly ? `${url}?te-ardhshme=1` : url), { refresh: upcomingOnly && upcoming < total });
    if (!result) return;
    toast.success(t.deleted(result.count));
    if (!upcomingOnly || upcoming === total) router.push("/admin/mesimet");
  }

  return (
    <div className="flex flex-wrap gap-2">
      {drafts > 0 && (
        <Button disabled={pending} onClick={() => run(() => apiSend("post", `${url}/publication`, { publication: "PUBLISHED" }), { success: t.published(drafts) })}>
          <Send aria-hidden /> {t.publish(drafts)}
        </Button>
      )}
      {upcoming > 0 && (
        <ConfirmAction
          trigger={
            <Button variant="destructive" disabled={pending}>
              <Ban aria-hidden /> {t.cancel}
            </Button>
          }
          title={t.cancelTitle}
          description={t.cancelBody(upcoming)}
          confirmLabel={t.cancel}
          destructive
          onConfirm={() => run(() => apiSend("post", `${url}/publication`, { publication: "CANCELLED" }), { success: t.cancelled(upcoming) })}
        />
      )}
      {upcoming > 0 && upcoming < total && (
        <ConfirmAction
          trigger={
            <Button variant="ghost" className="text-destructive" disabled={pending}>
              <Trash2 aria-hidden /> {t.deleteUpcoming}
            </Button>
          }
          title={`${t.deleteUpcoming}?`}
          description={t.deleteUpcomingBody(upcoming)}
          confirmLabel={common.actions.delete}
          destructive
          onConfirm={() => remove(true)}
        />
      )}
      <ConfirmAction
        trigger={
          <Button variant="ghost" className="text-destructive" disabled={pending}>
            <Trash2 aria-hidden /> {t.deleteAll}
          </Button>
        }
        title={`${t.deleteAll}?`}
        description={t.deleteAllBody(total)}
        confirmLabel={common.actions.delete}
        destructive
        onConfirm={() => remove(false)}
      />
    </div>
  );
}

/** Who is in the upcoming dates, with "remove from the series" and adding someone to all of them. */
export function SeriesStudents({
  seriesId,
  nextLessonId,
  upcoming,
  students,
}: {
  seriesId: string;
  nextLessonId: string;
  upcoming: number;
  students: { id: string; name: string; email: string; lessons: number }[];
}) {
  const { run, pending } = useApiAction();

  return (
    <div className="grid gap-4">
      {students.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.studentsEmpty}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {students.map((student) => (
            <li key={student.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium">{student.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {student.email} · {t.inLessons(student.lessons, upcoming)}
                </p>
              </div>
              <ConfirmAction
                trigger={
                  <Button variant="ghost" size="sm" disabled={pending} aria-label={`${t.remove}: ${student.name}`}>
                    <UserMinus aria-hidden /> <span className="hidden sm:inline">{t.remove}</span>
                  </Button>
                }
                title={t.removeTitle}
                description={t.removeBody(student.name)}
                confirmLabel={t.remove}
                destructive
                onConfirm={async () => {
                  const result = await run(() => apiSend<{ removed: number }>("delete", `/admin/series/${seriesId}/students/${encodeURIComponent(student.id)}`));
                  if (result) toast.success(t.removed(result.removed));
                }}
              />
            </li>
          ))}
        </ul>
      )}
      <AddStudent lessonId={nextLessonId} addTo={{ url: `/admin/series/${seriesId}/students`, body: (student) => ({ userIds: [student.id] }) }} />
    </div>
  );
}
