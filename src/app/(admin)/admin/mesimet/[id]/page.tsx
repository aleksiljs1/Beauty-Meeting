import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import { InvitationsPanel } from "@/components/admin/lessons/invitations-panel";
import { LessonForm } from "@/components/admin/lessons/lesson-form";
import { LessonStatusPanel } from "@/components/admin/lessons/lesson-status-panel";
import { LESSON_TABS, LessonTabs, type LessonTab } from "@/components/admin/lessons/lesson-tabs";
import { MaterialsPanel } from "@/components/admin/lessons/materials-panel";
import { RecordingsPanel } from "@/components/admin/lessons/recordings-panel";
import { RosterPanel } from "@/components/admin/lessons/roster-panel";
import { DemoBadge, PageHeader, Pagination, SectionCard } from "@/components/admin/page-parts";
import { admin } from "@/i18n/admin";
import { formatDateTime, formatTimeRange, formatWeekdayDate, ACADEMY_TIMEZONE_LABEL, timezoneAbbreviation } from "@/lib/datetime";
import { requirePageUser } from "@/server/auth/session";
import { env } from "@/server/env";
import { getAdminLesson, getLessonRoster, listCourses, listLessonInvitations } from "@/server/queries/admin";
import { listMaterials } from "@/server/services/materials";
import { listRecordings } from "@/server/services/recordings";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export async function generateMetadata({ params }: PageProps<"/admin/mesimet/[id]">): Promise<Metadata> {
  await requirePageUser("admin");
  const { id } = await params;
  const lesson = UUID.test(id) ? await getAdminLesson(id) : null;
  return { title: lesson?.title ?? admin.lessons.title };
}

export default async function LessonDetailPage({ params, searchParams }: PageProps<"/admin/mesimet/[id]">) {
  const user = await requirePageUser("admin");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const query = await searchParams;
  const tab: LessonTab = LESSON_TABS.find((t) => t === one(query.tab)) ?? "detaje";
  const rosterPage = Math.max(1, Number(one(query.faqe)) || 1);

  const lesson = await getAdminLesson(id);
  if (!lesson) notFound();
  const [courses, roster, invitations, materials, recordings] = await Promise.all([
    listCourses(),
    getLessonRoster(id, rosterPage),
    listLessonInvitations(id),
    listMaterials(user, id),
    listRecordings(user, id),
  ]);

  return (
    <div className="space-y-6">
      <Link href="/admin/mesimet" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> {admin.lessons.backToList}
      </Link>
      <div className="space-y-2">
        <PageHeader title={lesson.title} />
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {lesson.isDemo && <DemoBadge />}
          {formatWeekdayDate(lesson.scheduledStartAt)} · {formatTimeRange(lesson.scheduledStartAt, lesson.scheduledEndAt)} · {admin.lessonForm.deadline}:{" "}
          {formatDateTime(lesson.accessExpiresAt)} ({ACADEMY_TIMEZONE_LABEL}, {timezoneAbbreviation(lesson.accessExpiresAt)})
        </p>
      </div>

      <LessonTabs
        initialTab={tab}
        panels={{
          detaje: (
            <>
              <SectionCard title={admin.lessonActions.status}>
                <LessonStatusPanel lesson={lesson} zoomMode={env.ZOOM_MODE} />
              </SectionCard>
              <SectionCard title={admin.lessons.tabs.details}>
                <LessonForm lesson={lesson} courses={courses} demoAllowed={env.ZOOM_MODE === "demo"} />
              </SectionCard>
            </>
          ),
          studentet: (
            <SectionCard title={admin.roster.title}>
              <RosterPanel lessonId={lesson.id} lessonDeadline={lesson.accessExpiresAt} rows={roster.items} />
              <Pagination page={roster.page} pageCount={roster.pageCount} href={(p) => `/admin/mesimet/${lesson.id}?tab=studentet&faqe=${p}`} />
            </SectionCard>
          ),
          ftesat: (
            <SectionCard title={admin.invitations.title}>
              <InvitationsPanel lesson={lesson} invitations={invitations} />
            </SectionCard>
          ),
          materialet: (
            <SectionCard title={admin.materials.title}>
              <MaterialsPanel lessonId={lesson.id} materials={materials} />
            </SectionCard>
          ),
          regjistrimet: (
            <SectionCard title={admin.recordings.title}>
              <RecordingsPanel lessonId={lesson.id} recordings={recordings} />
            </SectionCard>
          ),
        }}
      />
    </div>
  );
}
