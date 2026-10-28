import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, FilterChip, PageHeader } from "@/components/admin/page-parts";
import { PaymentActions } from "@/components/admin/payments/payment-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { admin } from "@/i18n/admin";
import { courseMonthLabel, formatEuro, type BillingStatus } from "@/lib/billing";
import { formatCalendarDate } from "@/lib/datetime";
import { requirePageUser } from "@/server/auth/session";
import { listCourses } from "@/server/queries/admin";
import { listPaymentAccounts } from "@/server/queries/payments";

export const metadata: Metadata = { title: admin.payments.title };

const t = admin.payments;
const STATUSES: BillingStatus[] = ["OVERDUE", "DUE_SOON", "PAID", "COMPLETE"];
const STATUS_BADGE: Record<BillingStatus, "destructive" | "outline" | "secondary"> = {
  OVERDUE: "destructive",
  DUE_SOON: "outline",
  PAID: "outline",
  COMPLETE: "secondary",
};
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const monthLabel = (month: number) => {
  const { year, month: m } = courseMonthLabel(month);
  return t.month(year, m);
};

function Total({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="rounded-md border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-3xl">{formatEuro(cents)}</p>
    </div>
  );
}

export default async function PaymentsPage({ searchParams }: PageProps<"/admin/pagesat">) {
  await requirePageUser("admin");
  const params = await searchParams;
  const courses = await listCourses();
  const courseId = courses.find((c) => c.id === one(params.kursi))?.id;
  const status = STATUSES.find((s) => s === one(params.gjendja));
  const { accounts, unbilledCourses } = await listPaymentAccounts({ courseId });
  const shown = status ? accounts.filter((a) => a.status === status) : accounts;
  const sum = (pick: (a: (typeof accounts)[number]) => number | null) => accounts.reduce((total, a) => total + (pick(a) ?? 0), 0);

  const href = ({ kursi = courseId, gjendja = status }: { kursi?: string; gjendja?: string }) => {
    const search = new URLSearchParams();
    if (kursi) search.set("kursi", kursi);
    if (gjendja) search.set("gjendja", gjendja);
    return search.size ? `/admin/pagesat?${search}` : "/admin/pagesat";
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} intro={t.intro} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Total label={t.totals.owed} cents={sum((a) => a.amountOwedCents)} />
        <Total label={t.totals.paid} cents={sum((a) => a.amountPaidCents)} />
        <Total label={t.totals.left} cents={sum((a) => a.amountLeftCents)} />
      </div>

      {unbilledCourses.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{t.unbilled(unbilledCourses.map((c) => c.title).join(", "))}</p>
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/permbajtja/kurset">{t.setUpCourses}</Link>
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {courses.length > 1 && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.courseFilter}>
            <span className="text-xs text-muted-foreground">{t.courseFilter}</span>
            <FilterChip href={href({ kursi: "" })} active={!courseId}>
              {t.all}
            </FilterChip>
            {courses.map((course) => (
              <FilterChip key={course.id} href={href({ kursi: course.id })} active={courseId === course.id}>
                {course.title}
              </FilterChip>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.statusFilter}>
          <span className="text-xs text-muted-foreground">{t.statusFilter}</span>
          <FilterChip href={href({ gjendja: "" })} active={!status}>
            {`${t.all} (${accounts.length})`}
          </FilterChip>
          {STATUSES.map((s) => (
            <FilterChip key={s} href={href({ gjendja: s })} active={status === s}>
              {`${t.status[s]} (${accounts.filter((a) => a.status === s).length})`}
            </FilterChip>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState>{accounts.length ? t.emptyFilter : t.empty}</EmptyState>
      ) : (
        <div className="rounded-md border bg-card">
          <div className="hidden grid-cols-[2fr_1.5fr_1.5fr_2fr_1fr_1fr_3rem] gap-4 border-b px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
            <span>{t.columns.student}</span>
            <span>{t.columns.course}</span>
            <span>{t.columns.paid}</span>
            <span>{t.columns.until}</span>
            <span className="text-right">{t.columns.owed}</span>
            <span>{t.columns.status}</span>
            <span className="sr-only">{t.columns.actions}</span>
          </div>
          <ul className="divide-y">
            {shown.map((a) => (
              <li
                key={`${a.courseId}:${a.userId}`}
                className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 md:grid-cols-[2fr_1.5fr_1.5fr_2fr_1fr_1fr_3rem]"
              >
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {a.name}
                  {!a.active && <Badge variant="destructive">{t.inactive}</Badge>}
                </span>
                <span className="col-start-1 text-sm md:col-start-auto">
                  {a.courseTitle}
                  {a.firstMonth > 1 && <span className="block text-xs text-muted-foreground">{t.startsFrom(monthLabel(a.firstMonth))}</span>}
                </span>
                <span className="col-start-1 text-sm md:col-start-auto">
                  {formatEuro(a.amountPaidCents)}
                  <span className="block text-xs text-muted-foreground">{t.paidOf(a.monthsPaid, a.durationMonths - a.firstMonth + 1)}</span>
                </span>
                <span className="col-start-1 text-sm md:col-start-auto">
                  <span className="text-muted-foreground md:sr-only">{t.columns.until}: </span>
                  {a.paidUntil ? `${monthLabel(a.paidThroughMonth)} (${formatCalendarDate(a.paidUntil)})` : t.nothingPaid}
                  {a.nextDueOn && <span className="block text-xs text-muted-foreground">{t.due(formatCalendarDate(a.nextDueOn))}</span>}
                </span>
                <span className="col-start-1 text-sm md:col-start-auto md:text-right">
                  <span className="text-muted-foreground md:sr-only">{t.columns.owed}: </span>
                  {a.monthsOwed === 0 ? "—" : a.amountOwedCents !== null ? formatEuro(a.amountOwedCents) : t.months(a.monthsOwed)}
                  {a.monthsOwed > 0 && a.amountOwedCents !== null && <span className="block text-xs text-muted-foreground">{t.months(a.monthsOwed)}</span>}
                </span>
                <span className="col-start-1 md:col-start-auto">
                  <Badge variant={STATUS_BADGE[a.status]}>{t.status[a.status]}</Badge>
                </span>
                <span className="col-start-2 row-span-6 row-start-1 justify-self-end md:col-start-auto md:row-span-1 md:row-start-auto">
                  <PaymentActions account={a} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
