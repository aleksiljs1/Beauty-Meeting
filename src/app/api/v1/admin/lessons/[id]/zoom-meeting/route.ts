import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { uuidParam } from "@/server/validation/admin";
import { createZoomMeetingForLesson } from "@/server/zoom/meetings";
import { syncLessonFromZoom } from "@/server/zoom/webhooks";

type Ctx = RouteContext<"/api/v1/admin/lessons/[id]/zoom-meeting">;

/** Creates the lesson's Zoom meeting (duplicate-safe). */
export const POST = route<Ctx>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = uuidParam((await params).id, "Mësimi nuk u gjet.");
  return ok(await createZoomMeetingForLesson(id, admin), { status: 201 });
});

/** Re-reads the meeting's live status from Zoom — recovers from a missed webhook. */
export const PATCH = route<Ctx>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = uuidParam((await params).id, "Mësimi nuk u gjet.");
  return ok(await syncLessonFromZoom(id, admin));
});
