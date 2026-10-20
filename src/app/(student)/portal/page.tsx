import { BookOpen, PlayCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/portal/empty-state";
import { LessonCard } from "@/components/portal/lesson-card";
import { LiveRefresher } from "@/components/portal/live-refresher";
import { portalText } from "@/i18n/portal";
import { requirePageUser } from "@/server/auth/session";
import { listStudentLessons } from "@/server/queries/portal";

const t = portalText.dashboard;

export const metadata: Metadata = { title: t.metaTitle };

const UPCOMING = new Set(["UPCOMING", "STARTING_SOON", "WAITING_FOR_HOST"]);

export default async function DashboardPage() {
  const user = await requirePageUser("student");
  const lessons = await listStudentLessons(user);

  const live = lessons.filter((l) => l.phase === "LIVE");
  const upcoming = lessons.filter((l) => UPCOMING.has(l.phase)).slice(0, 3);
  const replays = lessons
    .filter((l) => l.phase === "REPLAY")
    .sort((a, b) => b.scheduledStartAt.localeCompare(a.scheduledStartAt))
    .slice(0, 3);
  const firstName = user.name.split(/\s+/)[0] || user.name;

  return (
    <div className="grid gap-10">
      <LiveRefresher />
      <header>
        <h1 className="text-3xl sm:text-4xl">{t.greeting(firstName)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.intro}</p>
      </header>

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
          <div className="grid gap-4 md:grid-cols-2">
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
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
              <Link href="/portal/mesimet?filtri=regjistrime" className="text-sm text-rose-deep underline-offset-4 hover:underline">
                {t.seeAll}
              </Link>
            </div>
            {replays.length ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
