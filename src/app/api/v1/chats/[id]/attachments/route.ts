import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { startAttachment } from "@/server/services/chat";
import { chatIdParam, startAttachmentSchema } from "@/server/validation/chat";

type Ctx = RouteContext<"/api/v1/chats/[id]/attachments">;

/**
 * Start uploading a photo or file for a message (`{ filename, mimeType, sizeBytes, width?, height? }`).
 * Returns `{ id, uploadUrl, headers }`: PUT the file there, then send the message with `attachmentIds`.
 */
export const POST = route<Ctx>(async (request, { params }) => {
  const user = await requireApiUser(request);
  const id = chatIdParam((await params).id);
  return ok(await startAttachment(user, id, startAttachmentSchema.parse(await readJson(request))), { status: 201 });
});
