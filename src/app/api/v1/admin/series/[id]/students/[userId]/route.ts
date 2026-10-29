import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { removeSeriesStudent } from "@/server/services/lesson-series";
import { userIdParam, uuidParam } from "@/server/validation/admin";

/** Takes the student out of every upcoming date of the series. */
export const DELETE = route<RouteContext<"/api/v1/admin/series/[id]/students/[userId]">>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const { id, userId } = await params;
  return ok(await removeSeriesStudent(uuidParam(id, "Seria nuk u gjet."), userIdParam(userId), admin));
});
