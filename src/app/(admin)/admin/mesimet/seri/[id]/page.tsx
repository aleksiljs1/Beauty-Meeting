import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import { LessonItem } from "@/components/admin/lessons/lesson-list-item";
import { SeriesActions, SeriesEditForm, SeriesStudents } from "@/components/admin/lessons/series-panel";
import { DemoBadge, PageHeader, SectionCard } from "@/components/admin/page-parts";
import { admin } from "@/i18n/admin";
import { formatDate, formatTimeRange } from "@/lib/datetime";
import { requirePageUser } from "@/server/auth/session";
import { getLessonSeries, listCourses } from "@/server/queries/admin";

const t = admin.series;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<"/admin/mesimet/seri/[id]">): Promise<Metadata> {
  await requirePageUser("admin");
  const { id } = await params;
  const series = UUID.test(id) ? await getLessonSeries(id) : null;
  return { title: series?.title ?? admin.lessons.title };
}

/** A repeating lesson: change its upcoming dates together, or open one date to change it alone. */
export default async function LessonSeriesPage({ params }: PageProps<"/admin/mesimet/seri/[id]">) {
  await requirePageUser("admin");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [series, courses] = await Promise.all([getLessonSeries(id), listCourses()]);
  if (!series) notFound();

  const first = series.lessons[0];
  const last = series.lessons.at(-1)!;
  const next = series.upcoming[0];

  return (
    <div className="space-y-6">
      <Link href="/admin/mesimet" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> {t.back}
      </Link>
      <div className="space-y-2">
        <PageHeader title={series.title} intro={t.intro} />
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {series.isDemo && <DemoBadge />}
          {t.badge(series.lessons.length)} · {t.rhythm(series.weekdays.map((d) => admin.calendar.weekdays[d]))} ·{" "}
          {formatTimeRange(first.scheduledStartAt, first.scheduledEndAt)} · {formatDate(first.scheduledStartAt)} – {formatDate(last.scheduledStartAt)}
          {series.courseTitle ? ` · ${series.courseTitle}` : ""}
        </p>
      </div>

      <SectionCard title={t.actionsHeading}>
        <SeriesActions
          seriesId={series.id}
          drafts={series.upcoming.filter((l) => l.publication === "DRAFT").length}
          upcoming={series.upcoming.length}
          total={series.lessons.length}
        />
      </SectionCard>

      {next ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title={t.editHeading}>
            <SeriesEditForm key={next.id} seriesId={series.id} next={next} courses={courses} />
          </SectionCard>
          <SectionCard title={t.studentsHeading}>
            <SeriesStudents seriesId={series.id} nextLessonId={next.id} upcoming={series.upcoming.length} students={series.students} />
          </SectionCard>
        </div>
      ) : (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{t.noUpcoming}</p>
      )}

      <SectionCard title={t.datesHeading}>
        <ul className="-mx-4 divide-y border-y sm:-mx-6">
          {series.lessons.map((lesson) => (
            <li key={lesson.id}>
              <LessonItem lesson={lesson} />
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
