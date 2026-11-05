import Link from "next/link";
import { DemoBadge, MeetingBadge, PublicationBadge } from "@/components/admin/page-parts";
import { CoverImage } from "@/components/cover-image";
import { admin } from "@/i18n/admin";
import { formatTimeRange, formatWeekdayDate } from "@/lib/datetime";
import type { LessonRow } from "@/server/queries/admin";

const t = admin.lessons;

/** One lesson in a list: date and time, course, states and counts. */
export const lessonRowClass =
  "group flex flex-col gap-2 px-4 py-4 transition-colors duration-200 outline-none hover:bg-muted/40 focus-visible:bg-muted md:flex-row md:items-center md:justify-between";

/** The small photo at the start of a lesson row. */
export function LessonThumb({ src, title }: { src: string | null; title: string }) {
  return <CoverImage src={src} alt="" title={title} sizes="96px" className="hidden h-14 w-24 shrink-0 rounded-md border sm:block" />;
}

export function LessonItem({ lesson }: { lesson: LessonRow }) {
  return (
    <Link href={`/admin/mesimet/${lesson.id}`} className={lessonRowClass}>
      <div className="flex min-w-0 items-center gap-4">
        <LessonThumb src={lesson.coverSrc} title={lesson.courseTitle ?? lesson.title} />
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium group-hover:underline">{lesson.title}</span>
            {lesson.isDemo && <DemoBadge />}
          </div>
          <p className="text-sm text-muted-foreground">
            {formatWeekdayDate(lesson.scheduledStartAt)} · {formatTimeRange(lesson.scheduledStartAt, lesson.scheduledEndAt)}
            {lesson.courseTitle ? ` · ${lesson.courseTitle}` : ""}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground md:justify-end">
        <PublicationBadge publication={lesson.publication} />
        <MeetingBadge status={lesson.meetingStatus} />
        <span>
          {t.columns.students}: {lesson.students}
        </span>
        <span>
          {t.columns.materials}: {lesson.materials}
        </span>
      </div>
    </Link>
  );
}
