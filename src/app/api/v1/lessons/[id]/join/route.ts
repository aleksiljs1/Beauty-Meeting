import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { parseLessonId } from "@/server/queries/portal";
import { authorizeLessonJoin } from "@/server/zoom/join";

/**
 * Join the live class. Re-checked against the access policy on every request; real lessons
 * return a short-lived participant authorization (never in lists or notifications).
 */
export const POST = route<RouteContext<"/api/v1/lessons/[id]/join">>(async (request, { params }) => {
  const user = await requireApiUser(request);
  return ok(await authorizeLessonJoin(user, parseLessonId((await params).id)));
});
