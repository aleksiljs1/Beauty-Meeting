import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { parseLessonId } from "@/server/queries/portal";
import { authorizeZoomAppJoin } from "@/server/zoom/join";

/**
 * "Open in the Zoom app" fallback. Same access policy as the embedded join; returns the
 * meeting's Zoom link only on an explicit request (never cached, audited).
 */
export const POST = route<RouteContext<"/api/v1/lessons/[id]/zoom-app-link">>(async (request, { params }) => {
  const user = await requireApiUser(request);
  return ok(await authorizeZoomAppJoin(user, parseLessonId((await params).id)));
});
