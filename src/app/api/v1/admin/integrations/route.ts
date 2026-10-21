import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { getIntegrationStatus } from "@/server/queries/admin";

/** Configuration status only — variable names and reachability, never values. */
export const GET = route(async (request) => {
  await requireApiUser(request, "admin");
  return ok(await getIntegrationStatus());
});
