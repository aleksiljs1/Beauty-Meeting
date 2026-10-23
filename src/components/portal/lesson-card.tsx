import { CalendarDays, Clock, Hourglass } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { common } from "@/i18n/common";
import { portalText } from "@/i18n/portal";
import { formatDateTime, formatTimeRange, formatWeekdayDate, timezoneAbbreviation } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { StudentLessonCard } from "@/server/queries/portal";
import { PhaseBadge } from "./phase-badge";

const t = portalText.lessons;

/** "20 tetor 2026, 09:00 (CET)" — deadlines always carry the timezone. */
export function formatDeadline(iso: string) {
  return `${formatDateTime(iso)} (${timezoneAbbreviation(iso)})`;
}

export function LessonCard({ lesson, headingLevel = "h3" }: { lesson: StudentLessonCard; headingLevel?: "h2" | "h3" }) {
  const Heading = headingLevel;
  const history = lesson.phase === "EXPIRED" || lesson.phase === "CANCELLED";
  const href = `/portal/mesimet/${lesson.id}`;

  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4 transition-[border-color,box-shadow] duration-200 sm:p-5",
        history ? "bg-card/60" : "hover:border-rose/40 hover:shadow-[0_12px_32px_-20px_rgb(0_0_0/0.9)]",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <PhaseBadge phase={lesson.phase} />
        {lesson.isDemo ? (
          <span className="rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground">{t.demoBadge}</span>
        ) : null}
        {lesson.courseTitle ? <span className="truncate text-xs text-muted-foreground">{lesson.courseTitle}</span> : null}
      </div>

      <Heading className={cn("text-xl leading-snug", history && "text-muted-foreground")}>
        {history ? (
          lesson.title
        ) : (
          <Link
            href={href}
            className="rounded-sm underline-offset-4 transition-colors duration-200 outline-none hover:text-rose-deep hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {lesson.title}
          </Link>
        )}
      </Heading>

      {lesson.summary ? <p className="line-clamp-2 text-sm text-muted-foreground">{lesson.summary}</p> : null}

      <dl className="grid gap-1.5 text-sm">
        <div className="flex items-start gap-2">
          <dt className="sr-only">{portalText.lesson.scheduleLabel}</dt>
          <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <dd className="first-letter:uppercase">{formatWeekdayDate(lesson.scheduledStartAt)}</dd>
        </div>
        <div className="flex items-start gap-2">
          <dt className="sr-only">{portalText.lesson.scheduleLabel}</dt>
          <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <dd>{formatTimeRange(lesson.scheduledStartAt, lesson.scheduledEndAt)}</dd>
        </div>
        {lesson.deadline ? (
          <div className="flex items-start gap-2">
            <dt className="sr-only">{common.accessUntil}</dt>
            <Hourglass aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <dd className={cn(history && "text-muted-foreground")}>
              {lesson.phase === "EXPIRED" ? t.accessExpiredOn : common.accessUntil} {formatDeadline(lesson.deadline)}
            </dd>
          </div>
        ) : null}
      </dl>

      {history ? (
        <p className="text-xs text-muted-foreground">{lesson.phase === "CANCELLED" ? t.cancelled : t.historyOnly}</p>
      ) : (
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          {lesson.phase === "LIVE" && lesson.canJoin ? (
            <Button asChild size="lg" className="bg-live text-white hover:bg-live/90">
              <Link href={`${href}?bashkohu=1`}>{t.join}</Link>
            </Button>
          ) : null}
          {lesson.phase === "REPLAY" ? (
            <Button asChild size="lg" variant="secondary">
              <Link href={`${href}?panel=regjistrimet`}>{t.watchReplay}</Link>
            </Button>
          ) : null}
          <Button asChild size="lg" variant="outline">
            <Link href={href}>{t.open}</Link>
          </Button>
        </div>
      )}
    </article>
  );
}
