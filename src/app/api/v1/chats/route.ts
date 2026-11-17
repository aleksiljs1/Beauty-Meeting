import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { listChats } from "@/server/queries/chat";
import { startDirectChat } from "@/server/services/chat";
import { startChatSchema } from "@/server/validation/chat";

/** My chats (pinned first, then newest) and my total unread count for the badge. */
export const GET = route(async (request) => {
  const user = await requireApiUser(request);
  return ok(await listChats(user));
});

/** Start a chat with someone, or open the one we already have. Returns the chat id. */
export const POST = route(async (request) => {
  const user = await requireApiUser(request);
  return ok(await startDirectChat(user, startChatSchema.parse(await readJson(request))));
});
