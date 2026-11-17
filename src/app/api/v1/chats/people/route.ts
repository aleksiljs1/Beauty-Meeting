import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { searchPeople } from "@/server/queries/chat";
import { peopleQuery } from "@/server/validation/chat";

/** People to start a chat with: `?q=` searches by name; without it, the first 20 alphabetically. */
export const GET = route(async (request) => {
  const user = await requireApiUser(request);
  return ok(await searchPeople(user, peopleQuery(new URL(request.url))));
});
