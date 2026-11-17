import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { blockUser, unblockUser } from "@/server/services/chat";
import { personIdParam } from "@/server/validation/chat";

type Ctx = RouteContext<"/api/v1/chats/blocks/[userId]">;

/** Block this person: neither of us can message the other until I unblock. */
export const POST = route<Ctx>(async (request, { params }) => {
  const user = await requireApiUser(request);
  await blockUser(user, personIdParam((await params).userId));
  return ok({ blocked: true });
});

/** Unblock this person: the chat can continue (unless they blocked me too). */
export const DELETE = route<Ctx>(async (request, { params }) => {
  const user = await requireApiUser(request);
  await unblockUser(user, personIdParam((await params).userId));
  return ok({ blocked: false });
});
