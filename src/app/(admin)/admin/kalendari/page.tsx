import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyState, FilterChip, PageHeader } from "@/components/admin/page-parts";
import { Button } from "@/components/ui/button";
import { admin } from "@/i18n/admin";
import {
  academyDay,
  addDays,
  addMonths,
  formatMonthYear,
  formatTime,
  formatTimeRange,
  formatWeekdayDate,
  fromZonedInputValue,
  todayInAcademy,
  weekdayIndex,
} from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { listCalendarLessons, listCourses } from "@/server/queries/admin";

export const metadata: Metadata = { title: admin.calendar.title };

const t = admin.calendar;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** One colour per course (in course order) so a week reads at a glance; lessons without a course stay grey. */
const COURSE_COLORS = [
  { dot: "bg-rose", edge: "border-l-rose" },
  { dot: "bg-sky-500", edge: "border-l-sky-500" },
  { dot: "bg-emerald-500", edge: "border-l-emerald-500" },
  { dot: "bg-amber-500", edge: "border-l-amber-500" },
  { dot: "bg-violet-500", edge: "border-l-violet-500" },
  { dot: "bg-teal-500", edge: "border-l-teal-500" },
];
const NO_COURSE = { dot: "bg-muted-foreground", edge: "border-l-muted-foreground" };

type CalendarLesson = Awaited<ReturnType<typeof listCalendarLessons>>[number];

export default async function CalendarPage({ searchParams }: PageProps<"/admin/kalendari">) {
  await requirePageUser("admin");
  const params = await searchParams;
  const today = todayInAcademy();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(one(params.muaji) ?? "") ? one(params.muaji)! : today.slice(0, 7);
  const monthStart = `${month}-01`;
  const nextMonth = addMonths(monthStart, 1);

  // Whole weeks, Monday to Sunday, covering the month.
  const gridStart = addDays(monthStart, -weekdayIndex(monthStart));
  const weeks = Math.ceil((weekdayIndex(monthStart) + (Date.parse(nextMonth) - Date.parse(monthStart)) / 86_400_000) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));

  const courses = await listCourses();
  const courseId = courses.find((c) => c.id === one(params.kursi))?.id;
  const lessons = await listCalendarLessons({
    from: fromZonedInputValue(`${gridStart}T00:00`)!,
    to: fromZonedInputValue(`${addDays(gridStart, weeks * 7)}T00:00`)!,
    courseId,
  });
  const byDay = Map.groupBy(lessons, (lesson) => academyDay(lesson.scheduledStartAt));
  const colorOf = (id: string | null) => {
    const index = courses.findIndex((c) => c.id === id);
    return index < 0 ? NO_COURSE : COURSE_COLORS[index % COURSE_COLORS.length];
  };
  const monthDays = days.filter((day) => day.startsWith(month) && byDay.has(day));

  const href = ({ muaji = month, kursi = courseId }: { muaji?: string; kursi?: string }) => {
    const search = new URLSearchParams();
    if (muaji !== today.slice(0, 7)) search.set("muaji", muaji);
    if (kursi) search.set("kursi", kursi);
    return search.size ? `/admin/kalendari?${search}` : "/admin/kalendari";
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} intro={t.intro} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-medium capitalize">{formatMonthYear(monthStart)}</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" asChild>
            <Link href={href({ muaji: addMonths(monthStart, -1).slice(0, 7) })} aria-label={t.previous}>
              <ChevronLeft aria-hidden />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={href({ muaji: today.slice(0, 7) })}>{t.today}</Link>
          </Button>
          <Button variant="outline" size="icon" asChild>
            <Link href={href({ muaji: nextMonth.slice(0, 7) })} aria-label={t.next}>
              <ChevronRight aria-hidden />
            </Link>
          </Button>
        </div>
      </div>

      {courses.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.courseFilter}>
          <span className="text-xs text-muted-foreground">{t.courseFilter}</span>
          <FilterChip href={href({ kursi: "" })} active={!courseId}>
            {t.allCourses}
          </FilterChip>
          {courses.map((course) => (
            <FilterChip key={course.id} href={href({ kursi: course.id })} active={courseId === course.id}>
              <span className="inline-flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", colorOf(course.id).dot)} aria-hidden />
                {course.title}
              </span>
            </FilterChip>
          ))}
        </div>
      )}

      {/* Month grid (tablet and up). */}
      <div className="hidden overflow-hidden rounded-md border bg-card md:block">
        <div className="grid grid-cols-7 border-b text-xs font-medium text-muted-foreground">
          {t.weekdays.map((weekday) => (
            <span key={weekday} className="px-2 py-2">
              {weekday}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => (
            <div key={day} className={cn("min-h-28 border-r border-b p-1.5 [&:nth-child(7n)]:border-r-0", !day.startsWith(month) && "bg-muted/40")}>
              <span
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-full text-xs",
                  day === today ? "bg-foreground font-medium text-background" : !day.startsWith(month) && "text-muted-foreground",
                )}
              >
                {Number(day.slice(8))}
              </span>
              <ul className="mt-1 space-y-1">
                {byDay.get(day)?.map((lesson) => (
                  <li key={lesson.id}>
                    <LessonChip lesson={lesson} edge={colorOf(lesson.courseId).edge} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Agenda (phones): only the days of this month that have lessons. */}
      <div className="md:hidden">
        {monthDays.length === 0 ? (
          <EmptyState>{t.empty}</EmptyState>
        ) : (
          <ul className="space-y-4">
            {monthDays.map((day) => (
              <li key={day} className="space-y-2">
                <h3 className={cn("text-sm font-medium capitalize", day === today && "text-rose-deep")}>{formatWeekdayDate(`${day}T12:00:00Z`)}</h3>
                <ul className="space-y-2">
                  {byDay.get(day)!.map((lesson) => (
                    <li key={lesson.id}>
                      <Link
                        href={`/admin/mesimet/${lesson.id}`}
                        className={cn("block rounded-md border border-l-4 bg-card p-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50", colorOf(lesson.courseId).edge)}
                      >
                        <span className={cn("font-medium", lesson.publication === "CANCELLED" && "line-through")}>{lesson.title}</span>
                        <span className="block text-muted-foreground">{formatTimeRange(lesson.scheduledStartAt, lesson.scheduledEndAt)}</span>
                        <span className="block text-xs text-muted-foreground">
                          {lesson.courseTitle ?? t.noCourse}
                          <StateNote lesson={lesson} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StateNote({ lesson }: { lesson: CalendarLesson }) {
  if (lesson.publication === "CANCELLED") return <> · {t.cancelled}</>;
  if (lesson.publication === "DRAFT") return <> · {t.draft}</>;
  return null;
}

function LessonChip({ lesson, edge }: { lesson: CalendarLesson; edge: string }) {
  return (
    <Link
      href={`/admin/mesimet/${lesson.id}`}
      title={`${lesson.title} · ${formatTimeRange(lesson.scheduledStartAt, lesson.scheduledEndAt)}`}
      className={cn(
        "block rounded-sm border-l-[3px] bg-secondary/60 px-1.5 py-1 text-xs leading-tight outline-none hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/50",
        edge,
        lesson.publication !== "PUBLISHED" && "opacity-60",
      )}
    >
      <span className={cn("block truncate font-medium", lesson.publication === "CANCELLED" && "line-through")}>
        {formatTime(lesson.scheduledStartAt)}–{formatTime(lesson.scheduledEndAt)} {lesson.title}
      </span>
      <span className="block truncate text-muted-foreground">
        {lesson.courseTitle ?? t.noCourse}
        <StateNote lesson={lesson} />
      </span>
    </Link>
  );
}
