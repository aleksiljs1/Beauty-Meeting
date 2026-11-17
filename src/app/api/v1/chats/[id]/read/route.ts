import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { markChatRead } from "@/server/services/chat";
import { chatIdParam } from "@/server/validation/chat";

/** I've read this chat up to now (the other person sees "Parë"; my unread count drops). */
export const POST = route<RouteContext<"/api/v1/chats/[id]/read">>(async (request, { params }) => {
  const user = await requireApiUser(request);
  await markChatRead(user, chatIdParam((await params).id));
  return ok({ read: true });
});
