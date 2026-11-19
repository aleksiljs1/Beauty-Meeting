import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { attachmentLink } from "@/server/services/chat-attachments";
import { attachmentIdParam, attachmentLinkSchema, chatIdParam } from "@/server/validation/chat";

type Ctx = RouteContext<"/api/v1/chats/[id]/attachments/[attachmentId]/link">;

/** A fresh short-lived link to a photo or file in this chat: to show it, or `{ download: true }`. */
export const POST = route<Ctx>(async (request, { params }) => {
  const user = await requireApiUser(request);
  const { id, attachmentId } = await params;
  const { download } = attachmentLinkSchema.parse(await readJson(request));
  return ok(await attachmentLink(user, chatIdParam(id), attachmentIdParam(attachmentId), download));
});
