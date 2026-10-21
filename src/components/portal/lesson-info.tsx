import { common } from "@/i18n/common";
import { portalText } from "@/i18n/portal";
import { formatTimeRange, formatWeekdayDate } from "@/lib/datetime";
import { formatDeadline } from "./lesson-card";

const t = portalText.info;

export function LessonInfo({
  lesson,
}: {
  lesson: { summary: string | null; details: string | null; courseTitle: string | null; scheduledStartAt: string; scheduledEndAt: string; deadline: string | null };
}) {
  return (
    <div className="grid gap-5 text-sm">
      <dl className="grid gap-3">
        {lesson.courseTitle ? (
          <div>
            <dt className="text-xs text-muted-foreground">{portalText.lesson.courseLabel}</dt>
            <dd>{lesson.courseTitle}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs text-muted-foreground">{portalText.lesson.scheduleLabel}</dt>
          <dd className="first-letter:uppercase">{formatWeekdayDate(lesson.scheduledStartAt)}</dd>
          <dd>{formatTimeRange(lesson.scheduledStartAt, lesson.scheduledEndAt)}</dd>
        </div>
        {lesson.deadline ? (
          <div>
            <dt className="text-xs text-muted-foreground">{common.accessUntil}</dt>
            <dd>{formatDeadline(lesson.deadline)}</dd>
          </div>
        ) : null}
      </dl>
      {lesson.summary ? (
        <section className="grid gap-1">
          <h3 className="text-lg">{t.summary}</h3>
          <p className="whitespace-pre-line text-muted-foreground">{lesson.summary}</p>
        </section>
      ) : null}
      <section className="grid gap-1">
        <h3 className="text-lg">{t.details}</h3>
        <p className="whitespace-pre-line text-muted-foreground">{lesson.details || t.noDetails}</p>
      </section>
      <p className="text-xs text-muted-foreground">{t.timezoneNote}</p>
    </div>
  );
}
