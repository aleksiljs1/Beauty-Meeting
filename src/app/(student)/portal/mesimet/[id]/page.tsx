import { ArrowLeft, CalendarDays, Hourglass } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Classroom, type PanelTab } from "@/components/portal/classroom";
import { formatDeadline } from "@/components/portal/lesson-card";
import { LiveRefresher } from "@/components/portal/live-refresher";
import { PhaseBadge } from "@/components/portal/phase-badge";
import { common } from "@/i18n/common";
import { portalText } from "@/i18n/portal";
import { formatTimeRange, formatWeekdayDate } from "@/lib/datetime";
import { requirePageUser } from "@/server/auth/session";
import { ApiError } from "@/server/http";
import { getClassroom } from "@/server/queries/portal";

const t = portalText.lesson;

const PANEL_SLUGS: Record<string, PanelTab> = { materialet: "materials", info: "info", regjistrimet: "recordings" };

/** One policy-checked load per request, shared by generateMetadata and the page. */
const loadClassroom = cache(async (id: string) => {
  const user = await requirePageUser("student");
  try {
    return await getClassroom(user, id);
  } catch (error) {
    // Unknown, unpublished, revoked or not-enrolled lessons are indistinguishable (non-disclosing).
    if (error instanceof ApiError && error.code === "LESSON_NOT_AVAILABLE") notFound();
    throw error;
  }
});

export async function generateMetadata({ params }: PageProps<"/portal/mesimet/[id]">): Promise<Metadata> {
  const data = await loadClassroom((await params).id);
  return { title: data.lesson.title };
}

export default async function LessonPage({ params, searchParams }: PageProps<"/portal/mesimet/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const data = await loadClassroom(id);
  const { lesson } = data;

  const header = (
    <header className="grid gap-3">
      <Link href="/portal/mesimet" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t.back}
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <PhaseBadge phase={lesson.phase} />
        {lesson.courseTitle ? <span className="text-xs text-muted-foreground">{lesson.courseTitle}</span> : null}
      </div>
      <h1 className="text-3xl leading-tight sm:text-4xl">{lesson.title}</h1>
      <dl className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
        <div className="flex items-start gap-2">
          <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <dt className="sr-only">{t.scheduleLabel}</dt>
          <dd>
            <span className="first-letter:uppercase">{formatWeekdayDate(lesson.scheduledStartAt)}</span>
            {", "}
            {formatTimeRange(lesson.scheduledStartAt, lesson.scheduledEndAt)}
          </dd>
        </div>
        {lesson.deadline ? (
          <div className="flex items-start gap-2">
            <Hourglass aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <dt className="sr-only">{common.accessUntil}</dt>
            <dd>
              {common.accessUntil} {formatDeadline(lesson.deadline)}
            </dd>
          </div>
        ) : null}
      </dl>
    </header>
  );

  if (data.history) {
    return (
      <div className="grid max-w-3xl gap-6">
        {header}
        <section className="rounded-xl border bg-card p-6" aria-labelledby="history-title">
          <h2 id="history-title" className="text-2xl">
            {t.historyTitle}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{data.history.reason === "EXPIRED" ? t.expiredReason : t.cancelledReason}</p>
        </section>
      </div>
    );
  }

  const panel = typeof query.panel === "string" ? PANEL_SLUGS[query.panel] : undefined;

  return (
    <div className="grid gap-6">
      <LiveRefresher lessonId={lesson.id} />
      {header}
      <Classroom data={data} autoJoin={query.bashkohu === "1"} initialTab={panel ?? "materials"} />
    </div>
  );
}
