import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, CalendarClock, CalendarX, ChevronLeft, Percent, type LucideIcon } from "lucide-react";
import { EmptyState, IconBadge, PageHeader, SectionCard } from "@/components/admin/page-parts";
import { RateBar } from "@/components/admin/participation";
import { Badge } from "@/components/ui/badge";
import { statsText } from "@/i18n/stats";
import { formatDate, formatTimeRange, formatWeekdayDate } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { attendanceRate, getStudentParticipation } from "@/server/queries/participation";

const t = statsText.participation;
/** Better Auth user ids (letters, digits, - and _), not UUIDs. */
const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;

async function load(id: string) {
  return USER_ID.test(id) ? getStudentParticipation(id) : null;
}

export async function generateMetadata({ params }: PageProps<"/admin/studentet/[id]">): Promise<Metadata> {
  await requirePageUser("admin");
  const data = await load((await params).id);
  return { title: data?.student.name ?? t.notFound };
}

export default async function StudentPage({ params }: PageProps<"/admin/studentet/[id]">) {
  await requirePageUser("admin");
  const data = await load((await params).id);
  if (!data) notFound();
  const { student, classes, summary, upcoming } = data;
  const rate = attendanceRate(summary);
  const missed = summary.available - summary.attended;

  return (
    <div className="space-y-8">
      <Link href="/admin/studentet" className="inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
        <ChevronLeft aria-hidden className="size-4" /> {t.back}
      </Link>

      <PageHeader title={student.name} intro={[student.email, student.profile?.phone, student.profile?.city].filter(Boolean).join(" · ")} />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t.courses}:</span>
        {student.courses.length ? (
          student.courses.map((c) => (
            <Badge key={c.id} variant="outline" className="text-foreground">
              {c.title}
            </Badge>
          ))
        ) : (
          <span className="text-muted-foreground">{t.noCourse}</span>
        )}
        {student.banned && <Badge variant="destructive">{t.inactive}</Badge>}
        <span className="text-muted-foreground">· {t.since(formatDate(student.createdAt))}</span>
      </div>

      <div className="stagger grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Figure icon={CalendarClock} label={t.available} value={String(summary.available)} />
        <Figure icon={CalendarCheck} label={t.attended} value={String(summary.attended)} />
        <Figure icon={CalendarX} label={t.missed} value={String(missed)} danger={missed > 0} />
        <Figure icon={Percent} label={t.rate} value={rate === null ? "—" : `${rate}%`}>
          {rate !== null && <RateBar rate={rate} label={t.ratio(summary.attended, summary.available)} className="mt-2 text-xs text-muted-foreground" />}
        </Figure>
      </div>

      <SectionCard title={t.classesTitle} description={t.classesDescription} icon={CalendarCheck}>
        {classes.length === 0 ? (
          <EmptyState>{t.classesEmpty}</EmptyState>
        ) : (
          <ul className="space-y-2">
            {classes.map((c) => (
              <li key={c.lessonId}>
                <Link
                  href={`/admin/mesimet/${c.lessonId}?tab=pjesemarrja`}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-md border px-4 py-3 transition-colors duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    c.attended ? "hover:border-rose/40" : "border-destructive/40 bg-destructive/8 hover:border-destructive/70",
                  )}
                >
                  <span className="min-w-0">
                    <span className={cn("block font-medium", !c.attended && "text-destructive")}>{c.title}</span>
                    <span className="block text-sm text-muted-foreground first-letter:uppercase">
                      {formatWeekdayDate(c.scheduledStartAt)} · {formatTimeRange(c.scheduledStartAt, c.scheduledEndAt)}
                      {c.courseTitle ? ` · ${c.courseTitle}` : ""}
                    </span>
                  </span>
                  {c.attended ? (
                    <Badge variant="outline" className="border-rose/40 text-rose-deep">
                      {t.statusAttended(c.minutes)}
                    </Badge>
                  ) : (
                    <Badge variant="destructive">{t.statusMissed}</Badge>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">{t.note}</p>
      </SectionCard>

      <SectionCard title={t.upcomingTitle} icon={CalendarClock}>
        {upcoming.length === 0 ? (
          <EmptyState>{t.upcomingEmpty}</EmptyState>
        ) : (
          <ul className="divide-y">
            {upcoming.map((l) => (
              <li key={l.id}>
                <Link href={`/admin/mesimet/${l.id}`} className="-mx-2 block rounded-md px-2 py-3 transition-colors duration-200 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50">
                  <span className="block font-medium">{l.title}</span>
                  <span className="block text-sm text-muted-foreground first-letter:uppercase">
                    {formatWeekdayDate(l.scheduledStartAt)} · {formatTimeRange(l.scheduledStartAt, l.scheduledEndAt)}
                    {l.courseTitle ? ` · ${l.courseTitle}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function Figure({ icon, label, value, danger = false, children }: { icon: LucideIcon; label: string; value: string; danger?: boolean; children?: React.ReactNode }) {
  return (
    <div className="panel-sheen rounded-md border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <IconBadge icon={icon} tone={danger ? "danger" : "gold"} className="hidden sm:flex" />
      </div>
      <p className={cn("mt-2 font-heading text-4xl lining-nums tabular-nums", danger ? "text-destructive" : "text-gold")}>{value}</p>
      {children}
    </div>
  );
}
