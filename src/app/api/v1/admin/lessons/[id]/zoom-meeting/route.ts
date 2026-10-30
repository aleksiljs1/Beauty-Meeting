import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { uuidParam } from "@/server/validation/admin";
import { syncLessonFromZoom } from "@/server/zoom/webhooks";

type Ctx = RouteContext<"/api/v1/admin/lessons/[id]/zoom-meeting">;

/** Re-reads the meeting's live status from Zoom — recovers from a missed webhook. */
export const PATCH = route<Ctx>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = uuidParam((await params).id, "Mësimi nuk u gjet.");
  return ok(await syncLessonFromZoom(id, admin));
});
