import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/portal/empty-state";
import { LessonCard } from "@/components/portal/lesson-card";
import { LiveRefresher } from "@/components/portal/live-refresher";
import { portalText } from "@/i18n/portal";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { filterLessons, listStudentLessons, type LessonFilter } from "@/server/queries/portal";

const t = portalText.lessons;

export const metadata: Metadata = { title: t.metaTitle };

/** URL slug (Albanian) ⇄ filter. */
const FILTERS: { slug: string | null; filter: LessonFilter; label: string }[] = [
  { slug: null, filter: "all", label: t.filters.all },
  { slug: "te-ardhshme", filter: "upcoming", label: t.filters.upcoming },
  { slug: "live", filter: "live", label: t.filters.live },
  { slug: "regjistrime", filter: "replay", label: t.filters.replay },
  { slug: "skaduar", filter: "expired", label: t.filters.expired },
];

export default async function LessonsPage({ searchParams }: PageProps<"/portal/mesimet">) {
  const user = await requirePageUser("student");
  const { filtri } = await searchParams;
  const active = FILTERS.find((f) => f.slug !== null && f.slug === filtri) ?? FILTERS[0];

  const lessons = filterLessons(await listStudentLessons(user), active.filter);
  // History last, most recent first; everything else chronologically.
  if (active.filter === "expired" || active.filter === "replay") lessons.reverse();

  return (
    <div className="grid gap-6">
      <LiveRefresher />
      <h1 className="text-3xl sm:text-4xl">{t.title}</h1>

      <nav aria-label={t.filtersLabel} className="-mx-4 overflow-x-auto px-4">
        <ul className="flex w-max gap-2">
          {FILTERS.map((f) => {
            const selected = f === active;
            return (
              <li key={f.filter}>
                <Link
                  href={f.slug ? `/portal/mesimet?filtri=${f.slug}` : "/portal/mesimet"}
                  aria-current={selected ? "page" : undefined}
                  className={cn(
                    "inline-flex h-9 items-center rounded-full border px-4 text-sm whitespace-nowrap transition-colors",
                    selected ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted",
                  )}
                >
                  {f.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {lessons.length ? (
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {lessons.map((lesson) => (
            <li key={lesson.id} className="grid">
              <LessonCard lesson={lesson} headingLevel="h2" />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={t.empty[active.filter]} />
      )}
    </div>
  );
}
