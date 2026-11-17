import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { getMessages } from "@/server/queries/chat";
import { sendMessage } from "@/server/services/chat";
import { chatIdParam, messagesQuery, sendMessageSchema } from "@/server/validation/chat";

type Ctx = RouteContext<"/api/v1/chats/[id]/messages">;

/** A page of messages (newest page, or `?before=<messageId>` for older ones) plus read times for "Parë". */
export const GET = route<Ctx>(async (request, { params }) => {
  const user = await requireApiUser(request);
  const id = chatIdParam((await params).id);
  return ok(await getMessages(user, id, messagesQuery(new URL(request.url))));
});

/** Send a text message (`{ body }`). */
export const POST = route<Ctx>(async (request, { params }) => {
  const user = await requireApiUser(request);
  const id = chatIdParam((await params).id);
  return ok(await sendMessage(user, id, sendMessageSchema.parse(await readJson(request))), { status: 201 });
});
