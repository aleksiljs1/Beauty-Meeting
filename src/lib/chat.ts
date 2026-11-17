/**
 * Chat limits and types shared by the server and the browser (no server-only code here).
 * Dates arrive in the browser as ISO strings, hence `string` below.
 */

/** Longest message accepted (characters). */
export const MAX_MESSAGE_LENGTH = 2_000;

export type ChatSummary = {
  id: string;
  type: "DIRECT" | "GROUP";
  title: string;
  otherUser: { id: string; name: string; role: string } | null;
  lastMessage: { body: string | null; createdAt: string; mine: boolean } | null;
  unread: number;
  pinned: boolean;
};

export type ChatInbox = { chats: ChatSummary[]; unreadTotal: number };

export type ChatMessageItem = { id: string; senderId: string | null; body: string | null; createdAt: string; mine: boolean };

export type ChatPage = {
  messages: ChatMessageItem[];
  hasMore: boolean;
  readBy: { userId: string; name: string; lastReadAt: string | null }[];
};

export type ChatPerson = { id: string; name: string; role: string };
