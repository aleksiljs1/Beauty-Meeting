import "server-only";
import { z } from "zod";
import { MAX_ATTACHMENTS, MAX_MESSAGE_LENGTH } from "@/lib/chat";
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

/**
 * POST /chats/[id]/messages. Ends are trimmed; line breaks inside the text are kept. Text may be
 * empty when photos or files come with it (uploaded first: POST /chats/[id]/attachments).
 */
export const sendMessageSchema = z
  .object({
    body: z.string().trim().max(MAX_MESSAGE_LENGTH, `Mesazhi mund të ketë deri në ${MAX_MESSAGE_LENGTH} karaktere.`).default(""),
    attachmentIds: z.array(z.uuid()).max(MAX_ATTACHMENTS, `Mund të dërgoni deri në ${MAX_ATTACHMENTS} foto ose skedarë në një mesazh.`).default([]),
  })
  .refine((v) => v.body.length > 0 || v.attachmentIds.length > 0, { message: "Shkruani një mesazh.", path: ["body"] })
  .refine((v) => new Set(v.attachmentIds).size === v.attachmentIds.length, { message: "Skedar i dyfishuar.", path: ["attachmentIds"] });

/** POST /chats/[id]/attachments: a photo or file about to be uploaded (checked again after upload). */
export const startAttachmentSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.string().max(200),
  sizeBytes: z.number().int().positive(),
  /** Photos: pixel size as measured by the browser (only used to lay the chat out). */
  width: z.number().int().min(1).max(20_000).optional(),
  height: z.number().int().min(1).max(20_000).optional(),
});

/** POST /chats/[id]/attachments/[aid]/link: show it (photos, PDFs) or download it. */
export const attachmentLinkSchema = z.object({ download: z.boolean().default(false) });

/** Attachment ids are UUIDs; anything else is simply "not found". */
export const attachmentIdParam = (value: string) => uuidParam(value, "Skedari nuk u gjet.");

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
export type StartAttachmentInput = z.infer<typeof startAttachmentSchema>;
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
