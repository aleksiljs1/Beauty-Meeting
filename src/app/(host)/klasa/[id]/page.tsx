import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HostRoom } from "@/components/admin/lessons/host-room";
import { Toaster } from "@/components/ui/sonner";
import { zoomText } from "@/i18n/zoom";
import { requirePageUser } from "@/server/auth/session";
import { zoomLive } from "@/server/env";
import { getAdminLesson } from "@/server/queries/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { title: zoomText.room.title, robots: { index: false, follow: false } };

/**
 * The host's classroom in its own tab, outside the admin shell: the meeting gets the whole
 * window, and the teacher can keep using the admin portal in another tab without leaving the call.
 */
export default async function HostRoomPage({ params }: PageProps<"/klasa/[id]">) {
  await requirePageUser("admin");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const lesson = await getAdminLesson(id);
  if (!lesson || lesson.isDemo || !zoomLive) notFound();

  return (
    <>
      <HostRoom lessonId={lesson.id} title={lesson.title} meetingStatus={lesson.meetingStatus} />
      <Toaster position="top-center" />
    </>
  );
}
