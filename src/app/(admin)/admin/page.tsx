import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, CalendarClock, ClipboardCheck, Plus, Radio, Users, Wallet, type LucideIcon } from "lucide-react";
import { DemoBadge, EmptyState, IconBadge, MeetingBadge, PageHeader, PublicationBadge, SectionCard } from "@/components/admin/page-parts";
import { LessonThumb } from "@/components/admin/lessons/lesson-list-item";
import { Button } from "@/components/ui/button";
import { admin } from "@/i18n/admin";
import { formatEuro } from "@/lib/billing";
import { formatDateTime, formatTimeRange, formatWeekdayDate } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { getAdminDashboard, type DashboardIssue } from "@/server/queries/admin";
import { getPaymentAlerts } from "@/server/queries/payments";

export const metadata: Metadata = { title: admin.dashboard.title };

const t = admin.dashboard;

const ISSUE_LABEL: Record<DashboardIssue["kind"], string> = {
  RECORDING_FAILED: t.failedRecording,
  RECORDING_STALLED: t.stalledRecording,
  MATERIAL_FAILED: t.failedMaterial,
  MATERIAL_STALLED: t.stalledMaterial,
  DRAFT_STARTING: t.draftStarting,
};
const ISSUE_TAB: Record<DashboardIssue["kind"], string> = {
  RECORDING_FAILED: "regjistrimet",
  RECORDING_STALLED: "regjistrimet",
  MATERIAL_FAILED: "materialet",
  MATERIAL_STALLED: "materialet",
  DRAFT_STARTING: "detaje",
};

function Stat({ label, value, icon, href, live = false }: { label: string; value: number; icon: LucideIcon; href: string; live?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "panel-sheen card-lift relative flex items-center justify-between gap-4 overflow-hidden rounded-md border bg-card p-5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        live && "border-live/40",
      )}
    >
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={cn("mt-1 font-heading text-4xl lining-nums tabular-nums", live ? "text-live" : "text-gold")}>{value}</p>
      </div>
      <IconBadge icon={icon} tone={live ? "live" : "gold"} className={cn("size-11", live && "motion-safe:animate-pulse")} />
    </Link>
  );
}

export default async function AdminDashboardPage() {
  await requirePageUser("admin");
  const [data, payments] = await Promise.all([getAdminDashboard(), getPaymentAlerts()]);
  const paymentAlerts = [
    payments.overdue && { text: t.paymentsOverdue(payments.overdue, payments.amountOwedCents ? formatEuro(payments.amountOwedCents) : ""), href: "/admin/pagesat?gjendja=OVERDUE", urgent: true },
    payments.dueSoon && { text: t.paymentsDueSoon(payments.dueSoon), href: "/admin/pagesat?gjendja=DUE_SOON", urgent: false },
  ].filter((alert) => !!alert);

  return (
    <div className="space-y-8">
      <PageHeader
        title={t.title}
        intro={t.intro}
        actions={
          <>
            <Button asChild>
              <Link href="/admin/mesimet/i-ri">
                <Plus aria-hidden /> {t.newLesson}
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/admin/studentet?krijo=1">
                <Plus aria-hidden /> {t.newStudent}
              </Link>
            </Button>
          </>
        }
      />

      <div className="stagger grid gap-4 sm:grid-cols-3">
        <Stat label={t.activeStudents} value={data.activeStudents} icon={Users} href="/admin/studentet" />
        <Stat label={t.upcomingLessons} value={data.upcomingCount} icon={CalendarClock} href="/admin/kalendari" />
        <Stat label={t.liveNow} value={data.live.length} icon={Radio} href="/admin/mesimet" live={data.live.length > 0} />
      </div>

      <SectionCard title={t.issuesTitle} icon={ClipboardCheck}>
        {data.issues.length === 0 && paymentAlerts.length === 0 ? (
          <EmptyState>{t.issuesEmpty}</EmptyState>
        ) : (
          <ul className="divide-y">
            {paymentAlerts.map((alert) => (
              <li key={alert.href} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-center gap-3 text-sm font-medium">
                  <IconBadge icon={Wallet} tone={alert.urgent ? "danger" : "gold"} />
                  {alert.text}
                </p>
                <Button variant="outline" size="sm" asChild>
                  <Link href={alert.href}>{t.openPayments}</Link>
                </Button>
              </li>
            ))}
            {data.issues.map((issue) => (
              <li key={`${issue.kind}-${issue.id}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-3">
                  <IconBadge icon={AlertTriangle} tone="danger" />
                  <div className="space-y-0.5 text-sm">
                    <p className="font-medium">{ISSUE_LABEL[issue.kind]}</p>
                    <p className="text-muted-foreground">
                      {issue.lessonTitle ?? t.library}
                      {issue.name ? ` · ${issue.name}` : ""} · {formatDateTime(issue.at)}
                    </p>
                    {issue.message && <p className="text-destructive">{issue.message}</p>}
                  </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  {issue.lessonId ? (
                    <Link href={`/admin/mesimet/${issue.lessonId}?tab=${ISSUE_TAB[issue.kind]}`}>{t.openLesson}</Link>
                  ) : (
                    <Link href="/admin/materialet">{t.openLibrary}</Link>
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title={t.liveNow} icon={Radio}>
          {data.live.length === 0 ? (
            <EmptyState>{t.liveEmpty}</EmptyState>
          ) : (
            <LessonList lessons={data.live} />
          )}
        </SectionCard>
        <SectionCard title={t.upcomingTitle} icon={CalendarClock}>
          {data.upcoming.length === 0 ? <EmptyState>{t.upcomingEmpty}</EmptyState> : <LessonList lessons={data.upcoming} />}
        </SectionCard>
      </div>
    </div>
  );
}

function LessonList({ lessons }: { lessons: Awaited<ReturnType<typeof getAdminDashboard>>["upcoming"] }) {
  return (
    <ul className="divide-y">
      {lessons.map((lesson) => (
        <li key={lesson.id} className="py-3">
          <Link
            href={`/admin/mesimet/${lesson.id}`}
            className="group -mx-2 flex items-center gap-4 rounded-md px-2 py-1 transition-colors duration-200 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <LessonThumb src={lesson.coverSrc} title={lesson.title} />
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium group-hover:underline">{lesson.title}</span>
                {lesson.isDemo && <DemoBadge />}
              </div>
              <p className="text-sm text-muted-foreground">
                {formatWeekdayDate(lesson.scheduledStartAt)} · {formatTimeRange(lesson.scheduledStartAt, lesson.scheduledEndAt)}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <PublicationBadge publication={lesson.publication} />
                <MeetingBadge status={lesson.meetingStatus} />
                <span>
                  {lesson.students} {admin.shell.nav.students.toLowerCase()}
                </span>
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
