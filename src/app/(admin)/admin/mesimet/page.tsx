import Form from "next/form";
import Link from "next/link";
import type { Metadata } from "next";
import { Plus, Repeat, Search } from "lucide-react";
import { BulkDeleteLessons } from "@/components/admin/lessons/bulk-delete-lessons";
import { LessonItem, LessonThumb, lessonRowClass } from "@/components/admin/lessons/lesson-list-item";
import { DemoBadge, EmptyState, PageHeader, Pagination, PublicationBadge } from "@/components/admin/page-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { admin } from "@/i18n/admin";
import { common } from "@/i18n/common";
import { formatDate, formatTimeRange, formatWeekdayDate } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { countFilteredLessons, listCourses, listLessons, type LessonListFilter, type SeriesEntry } from "@/server/queries/admin";

export const metadata: Metadata = { title: admin.lessons.title };

const t = admin.lessons;
const PUBLICATIONS = ["DRAFT", "PUBLISHED", "CANCELLED", "ARCHIVED"] as const;
const WHEN = { "te-ardhshme": "upcoming", "te-kaluara": "past" } as const;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

type Query = { q?: string; kursi?: string; statusi?: string; koha?: string; faqe?: number };

function buildHref(query: Query) {
  const search = new URLSearchParams();
  if (query.q) search.set("q", query.q);
  if (query.kursi) search.set("kursi", query.kursi);
  if (query.statusi) search.set("statusi", query.statusi);
  if (query.koha) search.set("koha", query.koha);
  if (query.faqe && query.faqe > 1) search.set("faqe", String(query.faqe));
  return search.size ? `/admin/mesimet?${search}` : "/admin/mesimet";
}

function Chip({ href, active, children }: { href: string; active: boolean; children: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition-colors duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:border-rose/50 hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

export default async function LessonsPage({ searchParams }: PageProps<"/admin/mesimet">) {
  await requirePageUser("admin");
  const params = await searchParams;
  const statusi = PUBLICATIONS.find((p) => p === one(params.statusi));
  const kohaKey = one(params.koha);
  const koha = kohaKey && kohaKey in WHEN ? (kohaKey as keyof typeof WHEN) : undefined;
  const page = Math.max(1, Number(one(params.faqe)) || 1);
  const q = one(params.q)?.trim().slice(0, 100) || undefined;
  const courses = await listCourses();
  const kursi = courses.find((c) => c.id === one(params.kursi))?.id;
  // Every link keeps the other filters: `base` plus what the link changes.
  const base = { q, kursi, statusi, koha };

  const filter: LessonListFilter = { publication: statusi, when: koha ? WHEN[koha] : undefined, courseId: kursi, q, page };
  const [result, counts] = await Promise.all([listLessons(filter), countFilteredLessons(filter)]);
  const filtered = !!(statusi || koha || kursi || q);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.title}
        intro={t.intro}
        actions={
          <>
            <BulkDeleteLessons filter={{ publication: filter.publication, when: filter.when, courseId: kursi, q }} counts={counts} />
            <Button asChild>
              <Link href="/admin/mesimet/i-ri">
                <Plus aria-hidden /> {t.newLesson}
              </Link>
            </Button>
          </>
        }
      />

      <Form action="/admin/mesimet" className="flex max-w-lg items-end gap-2" role="search">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="lesson-search">{t.filters.searchLabel}</Label>
          <Input id="lesson-search" name="q" type="search" defaultValue={q} placeholder={t.filters.searchPlaceholder} />
          {kursi && <input type="hidden" name="kursi" value={kursi} />}
          {statusi && <input type="hidden" name="statusi" value={statusi} />}
          {koha && <input type="hidden" name="koha" value={koha} />}
        </div>
        <Button type="submit" variant="outline">
          <Search aria-hidden /> {t.filters.search}
        </Button>
      </Form>

      <div className="space-y-3" role="group" aria-label={t.filters.label}>
        {courses.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-20 text-xs text-muted-foreground">{t.filters.course}</span>
            <Chip href={buildHref({ ...base, kursi: undefined })} active={!kursi}>
              {t.filters.all}
            </Chip>
            {courses.map((c) => (
              <Chip key={c.id} href={buildHref({ ...base, kursi: c.id })} active={kursi === c.id}>
                {c.title}
              </Chip>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-20 text-xs text-muted-foreground">{t.filters.when}</span>
          <Chip href={buildHref({ ...base, koha: undefined })} active={!koha}>
            {t.filters.all}
          </Chip>
          <Chip href={buildHref({ ...base, koha: "te-ardhshme" })} active={koha === "te-ardhshme"}>
            {t.filters.upcoming}
          </Chip>
          <Chip href={buildHref({ ...base, koha: "te-kaluara" })} active={koha === "te-kaluara"}>
            {t.filters.past}
          </Chip>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-20 text-xs text-muted-foreground">{t.filters.publication}</span>
          <Chip href={buildHref({ ...base, statusi: undefined })} active={!statusi}>
            {t.filters.all}
          </Chip>
          {PUBLICATIONS.map((p) => (
            <Chip key={p} href={buildHref({ ...base, statusi: p })} active={statusi === p}>
              {common.publication[p]}
            </Chip>
          ))}
        </div>
      </div>

      {result.items.length === 0 ? (
        <EmptyState>{filtered ? t.emptyFiltered : t.empty}</EmptyState>
      ) : (
        <ul className="divide-y rounded-md border bg-card">
          {result.items.map((entry) => (
            <li key={entry.id}>{entry.kind === "series" ? <SeriesItem series={entry} /> : <LessonItem lesson={entry} />}</li>
          ))}
        </ul>
      )}
      <Pagination page={result.page} pageCount={result.pageCount} href={(p) => buildHref({ ...base, faqe: p })} />
    </div>
  );
}

/** A repeating lesson as one entry: its weekdays, date range and how many dates are in each state. */
function SeriesItem({ series }: { series: SeriesEntry }) {
  const first = series.lessons[0];
  const last = series.lessons.at(-1)!;
  const counts = PUBLICATIONS.map((p) => [p, series.lessons.filter((l) => l.publication === p).length] as const).filter(([, n]) => n > 0);
  return (
    <Link href={`/admin/mesimet/seri/${series.id}`} className={lessonRowClass}>
      <div className="flex min-w-0 items-center gap-4">
        <LessonThumb src={series.coverSrc} title={series.courseTitle ?? series.title} />
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Repeat className="size-4 text-muted-foreground" aria-hidden />
            <span className="font-medium group-hover:underline">{series.title}</span>
            <Badge variant="secondary">{admin.series.badge(series.lessons.length)}</Badge>
            {series.isDemo && <DemoBadge />}
          </div>
          <p className="text-sm text-muted-foreground">
            {admin.series.rhythm(series.weekdays.map((d) => admin.calendar.weekdays[d]))} · {formatTimeRange(first.scheduledStartAt, first.scheduledEndAt)} ·{" "}
            {formatDate(first.scheduledStartAt)} – {formatDate(last.scheduledStartAt)}
            {series.courseTitle ? ` · ${series.courseTitle}` : ""}
          </p>
          {series.next && <p className="text-xs text-muted-foreground">{admin.series.next(formatWeekdayDate(series.next.scheduledStartAt))}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground md:justify-end">
        {counts.map(([p, n]) => (
          <span key={p} className="inline-flex items-center gap-1">
            <PublicationBadge publication={p} /> ×{n}
          </span>
        ))}
        <span>
          {t.columns.students}: {Math.max(...series.lessons.map((l) => l.students))}
        </span>
      </div>
    </Link>
  );
}
