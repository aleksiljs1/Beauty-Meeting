import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";

export const GET = route(async (request) => {
  const user = await requireApiUser(request);
  return ok(user);
});
