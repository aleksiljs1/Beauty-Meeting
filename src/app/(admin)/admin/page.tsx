import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, Plus } from "lucide-react";
import { DemoBadge, EmptyState, MeetingBadge, PageHeader, PublicationBadge, SectionCard } from "@/components/admin/page-parts";
import { Button } from "@/components/ui/button";
import { admin } from "@/i18n/admin";
import { formatDateTime, formatTimeRange, formatWeekdayDate } from "@/lib/datetime";
import { requirePageUser } from "@/server/auth/session";
import { getAdminDashboard, type DashboardIssue } from "@/server/queries/admin";

export const metadata: Metadata = { title: admin.dashboard.title };

const t = admin.dashboard;

const ISSUE_LABEL: Record<DashboardIssue["kind"], string> = {
  RECORDING_FAILED: t.failedRecording,
  RECORDING_STALLED: t.stalledRecording,
  MATERIAL_FAILED: t.failedMaterial,
  MATERIAL_STALLED: t.stalledMaterial,
  ZOOM_MEETING_MISSING: t.zoomMeetingMissing,
};
const ISSUE_TAB: Record<DashboardIssue["kind"], string> = {
  RECORDING_FAILED: "regjistrimet",
  RECORDING_STALLED: "regjistrimet",
  MATERIAL_FAILED: "materialet",
  MATERIAL_STALLED: "materialet",
  ZOOM_MEETING_MISSING: "detaje",
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-4xl">{value}</p>
    </div>
  );
}

export default async function AdminDashboardPage() {
  await requirePageUser("admin");
  const data = await getAdminDashboard();

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

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t.activeStudents} value={data.activeStudents} />
        <Stat label={t.upcomingLessons} value={data.upcomingCount} />
        <Stat label={t.liveNow} value={data.live.length} />
      </div>

      <SectionCard title={t.issuesTitle}>
        {data.issues.length === 0 ? (
          <EmptyState>{t.issuesEmpty}</EmptyState>
        ) : (
          <ul className="divide-y">
            {data.issues.map((issue) => (
              <li key={`${issue.kind}-${issue.id}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-3">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                  <div className="space-y-0.5 text-sm">
                    <p className="font-medium">{ISSUE_LABEL[issue.kind]}</p>
                    <p className="text-muted-foreground">
                      {issue.lessonTitle}
                      {issue.name ? ` · ${issue.name}` : ""} · {formatDateTime(issue.at)}
                    </p>
                    {issue.message && <p className="text-destructive">{issue.message}</p>}
                  </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/admin/mesimet/${issue.lessonId}?tab=${ISSUE_TAB[issue.kind]}`}>{t.openLesson}</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title={t.liveNow}>
          {data.live.length === 0 ? (
            <EmptyState>{t.liveEmpty}</EmptyState>
          ) : (
            <LessonList lessons={data.live} />
          )}
        </SectionCard>
        <SectionCard title={t.upcomingTitle}>
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
          <Link href={`/admin/mesimet/${lesson.id}`} className="group block space-y-1 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
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
          </Link>
        </li>
      ))}
    </ul>
  );
}
