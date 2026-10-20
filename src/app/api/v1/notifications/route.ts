import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { getLiveFeed } from "@/server/services/live";

/** Polled by the live-class alert and the notification bell (~every 20 s). */
export const GET = route(async (request) => {
  const user = await requireApiUser(request);
  return ok(await getLiveFeed(user));
});
