import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { removeUnsentAttachment } from "@/server/services/chat-attachments";
import { attachmentIdParam, chatIdParam } from "@/server/validation/chat";

type Ctx = RouteContext<"/api/v1/chats/[id]/attachments/[attachmentId]">;

/** Remove a picked photo or file before sending it (only my own, only unsent). */
export const DELETE = route<Ctx>(async (request, { params }) => {
  const user = await requireApiUser(request);
  const { id, attachmentId } = await params;
  await removeUnsentAttachment(user, chatIdParam(id), attachmentIdParam(attachmentId));
  return ok({ removed: true });
});
