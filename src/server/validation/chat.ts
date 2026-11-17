import "server-only";
import { z } from "zod";
import { MAX_MESSAGE_LENGTH } from "@/lib/chat";
import { ApiError } from "@/server/http";
import { uuidParam } from "./admin";

/** Zod schemas and param helpers shared by the /api/v1/chats route handlers. */

/** Longest message accepted (characters); shared with the chat screen's counter. */
export { MAX_MESSAGE_LENGTH };
/** Messages per page when opening a chat or scrolling back. */
export const MESSAGES_PAGE_SIZE = 50;

/** Chat ids are UUIDs; anything else is simply "not found". */
export const chatIdParam = (value: string) => uuidParam(value, "Biseda nuk u gjet.");

/** A person's id in the URL (blocking). Better Auth ids are opaque strings. */
export function personIdParam(value: string) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(value)) throw new ApiError("NOT_FOUND", "Ky person nuk u gjet.");
  return value;
}

/** POST /chats: start (or reopen) a direct chat with this person. */
export const startChatSchema = z.object({
  userId: z.string().min(1).max(100),
});

/** POST /chats/[id]/messages. Ends are trimmed; line breaks inside the text are kept. */
export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, "Shkruani një mesazh.").max(MAX_MESSAGE_LENGTH, `Mesazhi mund të ketë deri në ${MAX_MESSAGE_LENGTH} karaktere.`),
});

/** PATCH /chats/[id]: pin/unpin, or delete the chat for me. */
export const updateChatSchema = z
  .object({
    pinned: z.boolean().optional(),
    hidden: z.literal(true).optional(),
  })
  .refine((v) => v.pinned !== undefined || v.hidden !== undefined, "Asgjë për të ndryshuar.");

/** What the service receives: input that already passed the schemas above (limits included). */
export type StartChatInput = z.infer<typeof startChatSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type UpdateChatInput = z.infer<typeof updateChatSchema>;

/** GET /chats/[id]/messages?before=<messageId>: older messages than this one (none = newest). */
export function messagesQuery(url: URL) {
  const before = url.searchParams.get("before");
  return { before: before ? chatIdParam(before) : null, limit: MESSAGES_PAGE_SIZE };
}

/** GET /chats/people?q=: people search text (empty = everyone, alphabetically). */
export function peopleQuery(url: URL) {
  return { q: (url.searchParams.get("q") ?? "").trim().slice(0, 100) };
}
