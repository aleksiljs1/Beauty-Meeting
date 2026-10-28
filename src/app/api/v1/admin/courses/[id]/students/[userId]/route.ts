import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { setFirstMonth } from "@/server/services/payments";
import { firstMonthSchema, userIdParam, uuidParam } from "@/server/validation/admin";

/** Sets the course month a student pays from (e.g. they joined in month 2). */
export const PATCH = route<RouteContext<"/api/v1/admin/courses/[id]/students/[userId]">>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const { id, userId } = await params;
  const { firstMonth } = firstMonthSchema.parse(await readJson(request));
  await setFirstMonth(uuidParam(id, "Kursi nuk u gjet."), userIdParam(userId), firstMonth, admin);
  return ok({ firstMonth });
});
