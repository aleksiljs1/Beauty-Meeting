import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { getClassAlerts } from "@/server/queries/admin";

/** Classes running now or starting within the admin's reminder time (the banner on every admin page). */
export const GET = route(async (request) => {
  const admin = await requireApiUser(request, "admin");
  return ok(await getClassAlerts(admin.id));
});
