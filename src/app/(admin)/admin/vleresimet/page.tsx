import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { EmptyState, FilterChip, PageHeader, SectionCard } from "@/components/admin/page-parts";
import { RatingSummary, Stars } from "@/components/feedback/stars";
import { feedbackText } from "@/i18n/feedback";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { requirePageUser } from "@/server/auth/session";
import { getCourseFeedback, listAppFeedback, listEndedCourseFeedback, listOtherLessonFeedback, type FeedbackEntry } from "@/server/queries/feedback";

const t = feedbackText.admin;

export const metadata: Metadata = { title: t.metaTitle };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const VIEWS = { kurset: "courses", mesimet: "lessons", portali: "app" } as const;
type View = (typeof VIEWS)[keyof typeof VIEWS];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Entries({ entries }: { entries: FeedbackEntry[] }) {
  if (!entries.length) return <p className="text-sm text-muted-foreground">{t.noRatings}</p>;
  return (
    <ul className="divide-y rounded-md border">
      {entries.map((entry) => (
        <li key={entry.id} className="grid gap-1 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Stars value={entry.rating} />
            <span className="font-medium">{entry.studentName}</span>
            <time dateTime={entry.at} className="text-xs text-muted-foreground">
              {formatDateTime(entry.at)}
            </time>
          </div>
          <p className={entry.comment ? "whitespace-pre-line" : "text-muted-foreground"}>{entry.comment ?? t.noComment}</p>
        </li>
      ))}
    </ul>
  );
}

/** One lesson with its ratings, collapsed until opened. */
function LessonFeedback({ lesson }: { lesson: { id: string; title: string; startsAt: string; courseTitle?: string | null; summary: { average: number | null; count: number }; entries: FeedbackEntry[] } }) {
  return (
    <details className="group rounded-md border bg-card">
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 marker:content-none">
        <span className="min-w-0">
          <span className="block font-medium">{lesson.title}</span>
          <span className="block text-xs text-muted-foreground">{[formatDate(lesson.startsAt), lesson.courseTitle].filter(Boolean).join(" · ")}</span>
        </span>
        <RatingSummary {...lesson.summary} />
      </summary>
      {lesson.entries.length ? (
        <div className="border-t p-3">
          <Entries entries={lesson.entries} />
        </div>
      ) : null}
    </details>
  );
}

async function CourseDetail({ courseId }: { courseId: string }) {
  const course = await getCourseFeedback(courseId);
  if (!course) return <EmptyState>{t.notFound}</EmptyState>;
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-medium">{course.title}</h2>
      <SectionCard title={t.courseSection} actions={<RatingSummary {...course.summary} />}>
        <Entries entries={course.entries} />
      </SectionCard>
      <section className="space-y-3">
        <h3 className="text-xl font-medium">{t.lessonsSection}</h3>
        {course.lessons.map((lesson) => (
          <LessonFeedback key={lesson.id} lesson={lesson} />
        ))}
      </section>
    </div>
  );
}

async function EndedCourses() {
  const courses = await listEndedCourseFeedback();
  if (!courses.length) return <EmptyState>{t.coursesEmpty}</EmptyState>;
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {courses.map((course) => (
        <li key={course.id}>
          <Link
            href={`/admin/vleresimet?kursi=${course.id}`}
            className="grid h-full gap-2 rounded-md border bg-card p-4 transition-colors duration-200 outline-none hover:border-rose/50 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="text-lg font-medium">{course.title}</span>
            {course.endedAt ? (
              <span className="text-xs text-muted-foreground">
                {t.endedOn} {formatDate(course.endedAt)}
              </span>
            ) : null}
            <span className="grid gap-1 text-sm">
              <span className="text-xs text-muted-foreground">{t.courseRating}</span>
              <RatingSummary {...course.course} />
              <span className="text-xs text-muted-foreground">{t.lessonRatings}</span>
              <RatingSummary {...course.lessons} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function OtherLessons() {
  const lessons = await listOtherLessonFeedback();
  if (!lessons.length) return <EmptyState>{t.lessonsEmpty}</EmptyState>;
  return (
    <div className="space-y-3">
      {lessons.map((lesson) => (
        <LessonFeedback key={lesson.id} lesson={lesson} />
      ))}
    </div>
  );
}

async function AppFeedback() {
  const entries = await listAppFeedback();
  if (!entries.length) return <EmptyState>{t.appEmpty}</EmptyState>;
  return <Entries entries={entries} />;
}

export default async function AdminFeedbackPage({ searchParams }: PageProps<"/admin/vleresimet">) {
  await requirePageUser("admin");
  const params = await searchParams;
  const view: View = VIEWS[one(params.pamja) as keyof typeof VIEWS] ?? "courses";
  const courseId = one(params.kursi);

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} intro={t.intro} />
      <nav className="flex flex-wrap gap-2" aria-label={t.title}>
        {(Object.entries(VIEWS) as [string, View][]).map(([slug, id]) => (
          <FilterChip key={id} href={id === "courses" ? "/admin/vleresimet" : `/admin/vleresimet?pamja=${slug}`} active={view === id}>
            {t.tabs[id]}
          </FilterChip>
        ))}
      </nav>

      {view === "courses" && courseId && UUID.test(courseId) ? (
        <>
          <Link href="/admin/vleresimet" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft aria-hidden className="size-4" />
            {t.back}
          </Link>
          <CourseDetail courseId={courseId} />
        </>
      ) : view === "courses" ? (
        <EndedCourses />
      ) : view === "lessons" ? (
        <OtherLessons />
      ) : (
        <AppFeedback />
      )}
    </div>
  );
}
