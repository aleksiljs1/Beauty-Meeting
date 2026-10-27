import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { requireAdminLesson } from "@/server/queries/admin";
import { endLiveLesson } from "@/server/services/lessons";
import { uuidParam } from "@/server/validation/admin";

/** Ends the live class on the site (when Zoom never reported the end). */
export const DELETE = route<RouteContext<"/api/v1/admin/lessons/[id]/live">>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = uuidParam((await params).id, "Mësimi nuk u gjet.");
  await endLiveLesson(id, admin);
  const lesson = await requireAdminLesson(id);
  return ok({ meetingStatus: lesson.meetingStatus, liveEndedAt: lesson.liveEndedAt });
});
