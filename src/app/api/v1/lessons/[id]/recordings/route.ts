import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { parseLessonId } from "@/server/queries/portal";
import { listRecordings } from "@/server/services/recordings";

export const GET = route<RouteContext<"/api/v1/lessons/[id]/recordings">>(async (request, { params }) => {
  const user = await requireApiUser(request);
  const lessonId = parseLessonId((await params).id);
  return ok(await listRecordings(user, lessonId));
});
