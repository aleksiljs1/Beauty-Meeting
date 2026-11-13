import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CalendarCheck, Star, TrendingUp, UserRoundX, Users, Wallet, type LucideIcon } from "lucide-react";
import { EmptyState, IconBadge, PageHeader, SectionCard } from "@/components/admin/page-parts";
import { RateBar } from "@/components/admin/participation";
import { Button } from "@/components/ui/button";
import { statsText } from "@/i18n/stats";
import { formatEuro } from "@/lib/billing";
import { formatDate } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { getAcademyStats, type MonthIncome } from "@/server/queries/stats";

export const metadata: Metadata = { title: statsText.title };

const t = statsText;
const monthShort = new Intl.DateTimeFormat("sq-AL", { month: "short", timeZone: "UTC" });
const monthLong = new Intl.DateTimeFormat("sq-AL", { month: "long", year: "numeric", timeZone: "UTC" });
const monthDate = (month: string) => new Date(`${month}-01T12:00:00Z`);
const formatRating = (value: number) => value.toFixed(1).replace(".", ",");

export default async function StatsPage() {
  await requirePageUser("admin");
  const s = await getAcademyStats();

  return (
    <div className="space-y-8">
      <PageHeader title={t.title} intro={t.intro} />

      <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Wallet} label={t.cards.collected} value={formatEuro(s.collectedThisMonth)} sub={t.cards.collectedVsLast(formatEuro(s.collectedLastMonth))} />
        <Kpi
          icon={TrendingUp}
          label={t.cards.owed}
          value={formatEuro(s.owedCents)}
          sub={t.cards.owedStudents(s.overdueStudents)}
          tone={s.owedCents > 0 ? "danger" : "gold"}
          href={s.overdueStudents ? "/admin/pagesat?gjendja=OVERDUE" : undefined}
        />
        <Kpi
          icon={CalendarCheck}
          label={t.cards.attendance}
          value={s.attendance === null ? t.cards.none : `${s.attendance}%`}
          sub={t.cards.attendanceSub(s.periods.attendanceDays, s.attendanceClasses)}
        />
        <Kpi
          icon={Star}
          label={t.cards.rating}
          value={s.rating === null ? t.cards.none : formatRating(s.rating)}
          sub={t.cards.ratingSub(s.periods.ratingDays, s.ratingCount)}
          href="/admin/vleresimet"
        />
      </div>

      <SectionCard title={t.income.title} description={t.income.description} icon={Wallet}>
        {s.monthly.some((m) => m.cents > 0) ? <IncomeChart months={s.monthly} /> : <EmptyState>{t.income.empty}</EmptyState>}
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title={t.atRisk.title} description={t.atRisk.description(s.periods.atRiskMisses, s.periods.atRiskDays)} icon={UserRoundX}>
          {s.atRisk.length === 0 ? (
            <EmptyState>{t.atRisk.empty}</EmptyState>
          ) : (
            <ul className="divide-y">
              {s.atRisk.map((student) => (
                <li key={student.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <IconBadge icon={UserRoundX} tone="danger" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{student.name}</p>
                      <p className="text-sm text-muted-foreground">
                        <span className="text-destructive">{t.atRisk.missed(student.missedInRow)}</span> ·{" "}
                        {student.lastAttended ? t.atRisk.lastSeen(formatDate(student.lastAttended)) : t.atRisk.neverSeen}
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/studentet/${student.id}`}>{t.atRisk.open}</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title={t.cards.students} icon={Users}>
          <p className="font-heading text-5xl lining-nums tabular-nums text-gold">{s.activeStudents}</p>
          <p className="text-sm text-muted-foreground">{t.cards.studentsSub(s.newStudents)}</p>
        </SectionCard>
      </div>

      <SectionCard title={t.courses.title} icon={BookOpen}>
        {s.byCourse.length === 0 ? (
          <EmptyState>{t.courses.empty}</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-4 font-medium">{t.courses.course}</th>
                  <th className="py-2 pr-4 text-right font-medium">{t.courses.students}</th>
                  <th className="py-2 pr-4 font-medium">{t.courses.attendance}</th>
                  <th className="py-2 pr-4 text-right font-medium">{t.courses.income}</th>
                  <th className="py-2 text-right font-medium">{t.courses.rating}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {s.byCourse.map((course) => (
                  <tr key={course.id}>
                    <td className="py-3 pr-4 font-medium">{course.title}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">{course.students}</td>
                    <td className="py-3 pr-4">
                      {course.attendance === null ? <span className="text-muted-foreground">{t.cards.none}</span> : <RateBar rate={course.attendance} />}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">{formatEuro(course.incomeCents)}</td>
                    <td className="py-3 text-right tabular-nums">
                      {course.rating === null ? (
                        <span className="text-muted-foreground">{t.cards.none}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Star aria-hidden className="size-3.5 fill-rose text-rose" />
                          {formatRating(course.rating)}
                          <span className="text-xs text-muted-foreground">({course.ratingCount})</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function Kpi({ icon, label, value, sub, tone = "gold", href }: { icon: LucideIcon; label: string; value: string; sub: string; tone?: "gold" | "danger"; href?: string }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <IconBadge icon={icon} tone={tone} />
      </div>
      <p className={cn("mt-2 font-heading text-3xl lining-nums tabular-nums", tone === "danger" ? "text-destructive" : "text-gold")}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </>
  );
  const className = "panel-sheen block rounded-md border bg-card p-5";
  return href ? (
    <Link href={href} className={cn(className, "card-lift outline-none focus-visible:ring-3 focus-visible:ring-ring/50")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/**
 * One series over time: thin gold bars from a shared baseline, the value on hover/focus, labels on
 * the highest month and the current one only. A table carries the same numbers for screen readers.
 */
function IncomeChart({ months }: { months: MonthIncome[] }) {
  const max = Math.max(...months.map((m) => m.cents));
  const peak = months.findIndex((m) => m.cents === max);
  const last = months.length - 1;
  return (
    <figure>
      <div aria-hidden className="relative h-56">
        {/* Recessive guide lines at half and full height. */}
        <span className="absolute inset-x-0 top-0 border-t border-dashed border-border/60" />
        <span className="absolute inset-x-0 top-1/2 border-t border-dashed border-border/40" />
        <div className="absolute inset-0 flex items-end gap-1.5 border-b border-border sm:gap-3">
          {months.map((m, i) => {
            const height = max ? (m.cents / max) * 100 : 0;
            const labelled = m.cents > 0 && (i === peak || i === last);
            return (
              <div key={m.month} className="group relative flex h-full flex-1 items-end justify-center">
                {/* Hit area: the whole column, not just the bar. */}
                <span
                  className={cn(
                    "w-full max-w-9 rounded-t-[4px] transition-colors duration-200",
                    i === last ? "bg-rose-deep" : "bg-rose/55 group-hover:bg-rose",
                    m.cents === 0 && "h-0.5 rounded-none bg-border",
                  )}
                  style={m.cents ? { height: `${Math.max(height, 2)}%` } : undefined}
                />
                {labelled && (
                  <span className="pointer-events-none absolute -translate-y-1 text-[11px] whitespace-nowrap text-muted-foreground tabular-nums group-hover:opacity-0" style={{ bottom: `${height}%` }}>
                    {formatEuro(m.cents)}
                  </span>
                )}
                <span
                  className="pointer-events-none absolute z-10 -translate-y-2 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100"
                  style={{ bottom: `${height}%` }}
                >
                  <span className="block text-muted-foreground first-letter:uppercase">{monthLong.format(monthDate(m.month))}</span>
                  <span className="font-medium tabular-nums">{formatEuro(m.cents)}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div aria-hidden className="mt-2 flex gap-1.5 text-center text-[11px] text-muted-foreground sm:gap-3">
        {months.map((m) => (
          <span key={m.month} className="flex-1 truncate first-letter:uppercase">
            {monthShort.format(monthDate(m.month)).replace(".", "")}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{t.income.tableCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{t.income.month}</th>
            <th scope="col">{t.income.amount}</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month}>
              <td>{monthLong.format(monthDate(m.month))}</td>
              <td>{formatEuro(m.cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
