import { requireLessonCapability } from "@/server/access/lesson-access";
import { requireApiUser } from "@/server/auth/session";
import { ApiError, ok, route } from "@/server/http";
import { parseLessonId } from "@/server/queries/portal";

/**
 * Join the live class, re-checked against the policy on every request.
 * Phase 1 only serves the clearly labelled demo classroom; real Zoom joins come later and
 * will return SDK credentials here (never in lists or notifications).
 */
export const POST = route<RouteContext<"/api/v1/lessons/[id]/join">>(async (request, { params }) => {
  const user = await requireApiUser(request);
  const lessonId = parseLessonId((await params).id);
  const { lesson } = await requireLessonCapability(user, lessonId, "JOIN_LIVE");
  if (lesson.isDemo) return ok({ mode: "demo" as const });
  throw new ApiError("INTEGRATION_NOT_CONFIGURED", "Klasa live do të aktivizohet së shpejti.");
});
