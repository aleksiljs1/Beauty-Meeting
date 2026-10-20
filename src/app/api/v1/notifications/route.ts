import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { getLiveFeed } from "@/server/services/live";

/** Fetched by the shared live feed on realtime signals, focus and a slow safety poll. */
export const GET = route(async (request) => {
  const user = await requireApiUser(request);
  return ok(await getLiveFeed(user));
});
