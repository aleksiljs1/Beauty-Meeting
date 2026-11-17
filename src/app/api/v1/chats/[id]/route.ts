import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { updateChat } from "@/server/services/chat";
import { chatIdParam, updateChatSchema } from "@/server/validation/chat";

/** Pin/unpin (`{ pinned: true | false }`) or delete the chat for me (`{ hidden: true }`). */
export const PATCH = route<RouteContext<"/api/v1/chats/[id]">>(async (request, { params }) => {
  const user = await requireApiUser(request);
  const id = chatIdParam((await params).id);
  await updateChat(user, id, updateChatSchema.parse(await readJson(request)));
  return ok({ updated: true });
});
