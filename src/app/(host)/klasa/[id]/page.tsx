import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HostRoom } from "@/components/admin/lessons/host-room";
import { InvitationsPanel } from "@/components/admin/lessons/invitations-panel";
import { MaterialsPanel } from "@/components/admin/lessons/materials-panel";
import { RosterPanel } from "@/components/admin/lessons/roster-panel";
import { Toaster } from "@/components/ui/sonner";
import { zoomText } from "@/i18n/zoom";
import { requirePageUser } from "@/server/auth/session";
import { zoomLive } from "@/server/env";
import { getAdminLesson, getLessonRoster, listLessonInvitations } from "@/server/queries/admin";
import { listMaterials } from "@/server/services/materials";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { title: zoomText.room.title, robots: { index: false, follow: false } };

/**
 * The host's classroom, outside the admin shell: the meeting plus the lesson tools a teacher
 * needs during class (materials, students, invitation link) on one page, so nothing has to
 * navigate away from the call. The panels refresh this page's data in place; the meeting
 * itself lives in a client component that is never remounted.
 */
export default async function HostRoomPage({ params }: PageProps<"/klasa/[id]">) {
  const user = await requirePageUser("admin");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const lesson = await getAdminLesson(id);
  if (!lesson || lesson.isDemo || !zoomLive) notFound();
  const [materials, roster, invitations] = await Promise.all([listMaterials(user, id), getLessonRoster(id), listLessonInvitations(id)]);

  return (
    <>
      <HostRoom
        lessonId={lesson.id}
        title={lesson.title}
        meetingStatus={lesson.meetingStatus}
        panels={{
          materials: <MaterialsPanel lessonId={lesson.id} materials={materials} />,
          students: <RosterPanel lessonId={lesson.id} lessonDeadline={lesson.accessExpiresAt} rows={roster.items} />,
          invitations: <InvitationsPanel lesson={lesson} invitations={invitations} />,
        }}
      />
      <Toaster position="top-center" />
    </>
  );
}
