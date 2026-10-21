
import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { uuidParam } from "@/server/validation/admin";
import { createZoomMeetingForLesson } from "@/server/zoom/meetings";

type Ctx = RouteContext<"/api/v1/admin/lessons/[id]/zoom-meeting">;

/**
 * Creates a real Zoom meeting for one existing non-demo lesson.
 * Only authenticated admins may provision Zoom meetings.
 */
export const POST = route<Ctx>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = uuidParam((await params).id, "Mësimi nuk u gjet.");

  const meeting = await createZoomMeetingForLesson(id, admin);
  return ok(meeting, { status: 201 });
});
