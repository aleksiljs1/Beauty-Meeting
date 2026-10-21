import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { listAuditLog } from "@/server/queries/admin";
import { pageQuery } from "@/server/validation/admin";

export const GET = route(async (request) => {
  await requireApiUser(request, "admin");
  return ok(await listAuditLog(pageQuery(new URL(request.url).searchParams.get("page"))));
});
