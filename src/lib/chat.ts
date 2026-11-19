/**
 * Chat limits and types shared by the server and the browser (no server-only code here).
 * Dates arrive in the browser as ISO strings, hence `string` below.
 */

/** Longest message accepted (characters). */
export const MAX_MESSAGE_LENGTH = 2_000;
/** Photos and files in one message. */
export const MAX_ATTACHMENTS = 10;

/**
 * A photo or file in a message. `url`: photos only, a short-lived link to show it (it may have
 * expired by the time it's needed again: ask /chats/[id]/attachments/[aid]/link for a fresh one).
 */
export type ChatAttachmentItem = { id: string; name: string; mimeType: string; size: number; width: number | null; height: number | null; url: string | null };

export const isChatPhoto = (mimeType: string) => mimeType.startsWith("image/");

export type ChatSummary = {
  id: string;
  type: "DIRECT" | "GROUP";
  title: string;
  otherUser: { id: string; name: string; role: string } | null;
  /** `photos`/`files`: what came with it (shown when the message has no text). */
  lastMessage: { body: string | null; createdAt: string; mine: boolean; photos: number; files: number } | null;
  unread: number;
  pinned: boolean;
};

export type ChatInbox = { chats: ChatSummary[]; unreadTotal: number };

/** `body` is null for a deleted message and "" for one with only photos or files. */
export type ChatMessageItem = { id: string; senderId: string | null; body: string | null; createdAt: string; mine: boolean; attachments: ChatAttachmentItem[] };

export type ChatPage = {
  messages: ChatMessageItem[];
  hasMore: boolean;
  readBy: { userId: string; name: string; lastReadAt: string | null }[];
  /** A block in either direction stops sending in this chat. `byMe`: I can lift it by unblocking. */
  blocked: { byMe: boolean; byThem: boolean };
};

export type ChatPerson = { id: string; name: string; role: string };
