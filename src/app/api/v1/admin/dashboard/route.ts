import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { getAdminDashboard } from "@/server/queries/admin";

export const GET = route(async (request) => {
  await requireApiUser(request, "admin");
  return ok(await getAdminDashboard());
});
