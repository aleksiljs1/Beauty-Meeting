import { ArrowRight, BookOpen, CalendarClock, PlayCircle, Radio, Star, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/portal/empty-state";
import { LessonCard } from "@/components/portal/lesson-card";
import { LiveRefresher } from "@/components/portal/live-refresher";
import { Button } from "@/components/ui/button";
import { feedbackText } from "@/i18n/feedback";
import { portalText } from "@/i18n/portal";
import { formatTimeRange, formatWeekdayDate, toZonedInputValue } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { countPendingFeedback } from "@/server/queries/feedback";
import { listStudentLessons } from "@/server/queries/portal";

const t = portalText.dashboard;

export const metadata: Metadata = { title: t.metaTitle };

const UPCOMING = new Set(["UPCOMING", "STARTING_SOON", "WAITING_FOR_HOST"]);

export default async function DashboardPage() {
  const user = await requirePageUser("student");
  const [lessons, pendingFeedback] = await Promise.all([listStudentLessons(user), countPendingFeedback(user)]);

  const live = lessons.filter((l) => l.phase === "LIVE");
  const allUpcoming = lessons.filter((l) => UPCOMING.has(l.phase));
  const upcoming = allUpcoming.slice(0, 3);
  const allReplays = lessons.filter((l) => l.phase === "REPLAY");
  // Recent lessons include those over but still waiting for their recording, so they don't vanish.
  const replays = lessons
    .filter((l) => l.phase === "REPLAY" || l.phase === "ENDED")
    .sort((a, b) => b.scheduledStartAt.localeCompare(a.scheduledStartAt))
    .slice(0, 3);
  const firstName = user.name.split(/\s+/)[0] || user.name;
  const now = new Date();
  const hour = Number(toZonedInputValue(now).slice(11, 13));
  const next = allUpcoming[0];

  return (
    <div className="grid gap-10">
      <LiveRefresher />
      <header className="panel-sheen relative overflow-hidden rounded-2xl border bg-card p-6 animate-rise sm:p-8">
        {/* Two thin gold rings in the corner: quiet decoration. */}
        <span aria-hidden className="pointer-events-none absolute -top-24 -right-20 size-64 rounded-full border border-rose/15" />
        <span aria-hidden className="pointer-events-none absolute -top-12 -right-8 size-40 rounded-full border border-rose/10" />
        <p className="text-xs font-medium tracking-[0.16em] text-rose-deep uppercase first-letter:uppercase">{formatWeekdayDate(now)}</p>
        <h1 className="mt-2 text-3xl sm:text-4xl">
          {t.greetingFor(hour)}, <span className="text-gold">{firstName}</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.intro}</p>

        {live.length + allUpcoming.length + allReplays.length > 0 ? (
          <ul className="stagger mt-5 flex flex-wrap gap-2 text-sm">
            {live.length > 0 ? <Chip icon={Radio} live>{t.liveNow}</Chip> : null}
            {allUpcoming.length > 0 ? <Chip icon={CalendarClock}>{t.upcomingCount(allUpcoming.length)}</Chip> : null}
            {allReplays.length > 0 ? <Chip icon={PlayCircle}>{t.replayCount(allReplays.length)}</Chip> : null}
          </ul>
        ) : null}

        {next && !live.length ? (
          <Link
            href={`/portal/mesimet/${next.id}`}
            className="group mt-6 flex items-center gap-4 rounded-xl border border-rose/25 bg-background/40 p-4 transition-colors duration-300 outline-none hover:border-rose/60 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-rose/15 text-rose-deep">
              <CalendarClock className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs tracking-[0.14em] text-muted-foreground uppercase">{t.nextLesson}</span>
              <span className="block truncate font-medium">{next.title}</span>
              <span className="block text-sm text-muted-foreground first-letter:uppercase">
                {formatWeekdayDate(next.scheduledStartAt)} · {formatTimeRange(next.scheduledStartAt, next.scheduledEndAt)}
              </span>
            </span>
            <ArrowRight aria-hidden className="size-5 shrink-0 text-rose-deep transition-transform duration-300 motion-safe:group-hover:translate-x-1" />
          </Link>
        ) : null}
      </header>

      {pendingFeedback > 0 ? (
        <aside className="flex flex-wrap items-center gap-3 rounded-xl border border-rose/25 bg-card p-4 animate-rise [--rise-delay:120ms]">
          <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rose/15 text-rose-deep">
            <Star className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{feedbackText.student.pendingTitle(pendingFeedback)}</p>
            <p className="text-sm text-muted-foreground">{feedbackText.student.pendingBody}</p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/portal/vleresimi">{feedbackText.student.pendingAction}</Link>
          </Button>
        </aside>
      ) : null}

      {lessons.length === 0 ? (
        <EmptyState icon={BookOpen} title={t.noLessonsTitle}>
          {t.noLessonsBody}
        </EmptyState>
      ) : null}

      {live.length > 0 ? (
        <section aria-labelledby="live-heading" className="grid gap-3">
          <h2 id="live-heading" className="flex items-center gap-2 text-2xl">
            <span aria-hidden="true" className="size-2 rounded-full bg-live motion-safe:animate-pulse" />
            {t.liveNow}
          </h2>
          <div className="stagger grid gap-4 md:grid-cols-2">
            {live.map((lesson) => (
              <div key={lesson.id} className="rounded-xl ring-2 ring-live/30">
                <LessonCard lesson={lesson} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {lessons.length > 0 ? (
        <>
          <section aria-labelledby="upcoming-heading" className="grid gap-3">
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="upcoming-heading" className="text-2xl">
                {t.upcomingTitle}
              </h2>
              <Link href="/portal/mesimet?filtri=te-ardhshme" className="text-sm text-rose-deep underline-offset-4 hover:underline">
                {t.seeAll}
              </Link>
            </div>
            {upcoming.length ? (
              <div className="stagger grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {upcoming.map((lesson) => (
                  <LessonCard key={lesson.id} lesson={lesson} />
                ))}
              </div>
            ) : (
              <EmptyState title={t.upcomingEmpty} />
            )}
          </section>

          <section aria-labelledby="replays-heading" className="grid gap-3">
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="replays-heading" className="text-2xl">
                {t.replaysTitle}
              </h2>
              <Link href="/portal/mesimet?filtri=te-perfunduara" className="text-sm text-rose-deep underline-offset-4 hover:underline">
                {t.seeAll}
              </Link>
            </div>
            {replays.length ? (
              <div className="stagger grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {replays.map((lesson) => (
                  <LessonCard key={lesson.id} lesson={lesson} />
                ))}
              </div>
            ) : (
              <EmptyState icon={PlayCircle} title={t.replaysEmpty} />
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function Chip({ icon: Icon, live = false, children }: { icon: LucideIcon; live?: boolean; children: React.ReactNode }) {
  return (
    <li
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1",
        live ? "border-live/40 bg-live/10 text-foreground" : "border-border bg-background/40 text-muted-foreground",
      )}
    >
      <Icon aria-hidden className={cn("size-3.5", live ? "text-live motion-safe:animate-pulse" : "text-rose-deep")} />
      {children}
    </li>
  );
}
