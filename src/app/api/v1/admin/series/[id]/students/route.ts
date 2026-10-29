import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { addSeriesStudents } from "@/server/services/lesson-series";
import { enrollStudentsSchema, uuidParam } from "@/server/validation/admin";

/** Adds students to every upcoming date of the series. */
export const POST = route<RouteContext<"/api/v1/admin/series/[id]/students">>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = uuidParam((await params).id, "Seria nuk u gjet.");
  const { userIds } = enrollStudentsSchema.parse(await readJson(request));
  return ok(await addSeriesStudents(id, userIds, admin));
});
