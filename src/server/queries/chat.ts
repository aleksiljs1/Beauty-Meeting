import "server-only";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { isChatPhoto } from "@/lib/chat";
import { ApiError } from "@/server/http";
import { photoLink } from "@/server/services/chat-attachments";

/**
 * Read-only chat lookups: my chat list (with unread counts), a page of messages, people search.
 * Everything is limited to chats I'm a member of; the rules for changing things are in
 * services/chat.ts.
 */

const CHAT_NOT_FOUND = "Biseda nuk u gjet.";
/** Shown in place of a person whose account was deleted. */
export const DELETED_USER_NAME = "Përdorues i fshirë";

const latest = (...dates: (Date | null)[]) => new Date(Math.max(...dates.map((d) => d?.getTime() ?? 0)));

export type ChatListItem = {
  id: string;
  type: "DIRECT" | "GROUP";
  /** The other person's name (direct chats) or the group's name. */
  title: string;
  /** Direct chats: the other person (null once their account is deleted). */
  otherUser: { id: string; name: string; role: string } | null;
  lastMessage: { body: string | null; createdAt: Date; mine: boolean; photos: number; files: number } | null;
  unread: number;
  pinned: boolean;
};

/**
 * My chats: pinned first (latest pin on top), then by newest message. A chat I deleted for myself
 * stays off the list until a newer message arrives. An empty chat (started, nothing sent yet)
 * only shows to the person who started it.
 */
export async function listChats(user: AppUser): Promise<{ chats: ChatListItem[]; unreadTotal: number }> {
  const memberships = await prisma.conversationMember.findMany({
    where: { userId: user.id, leftAt: null },
    select: {
      pinnedAt: true,
      hiddenAt: true,
      clearedAt: true,
      lastReadAt: true,
      joinedAt: true,
      conversation: {
        select: {
          id: true,
          type: true,
          title: true,
          createdById: true,
          lastMessageAt: true,
          createdAt: true,
          members: { where: { userId: { not: user.id } }, select: { user: { select: { id: true, name: true, role: true } } } },
          messages: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
            select: { body: true, createdAt: true, senderId: true, deletedAt: true, attachments: { select: { mimeType: true } } },
          },
        },
      },
    },
  });

  const visible = memberships.filter(({ hiddenAt, conversation: c }) => {
    if (!c.lastMessageAt) return c.createdById === user.id;
    return !hiddenAt || c.lastMessageAt > hiddenAt;
  });

  // Unread per chat in one query: others' messages after the latest of my read time, my
  // "delete for me" and my joining (GREATEST skips the empty ones).
  const unreadRows = await prisma.$queryRaw<{ conversationId: string; unread: number }[]>`
    SELECT m."conversationId", count(*)::int AS unread
    FROM "Message" m
    JOIN "ConversationMember" cm ON cm."conversationId" = m."conversationId" AND cm."userId" = ${user.id}
    WHERE cm."leftAt" IS NULL
      AND m."deletedAt" IS NULL
      AND (m."senderId" IS NULL OR m."senderId" <> ${user.id})
      AND m."createdAt" > GREATEST(cm."lastReadAt", cm."clearedAt", cm."joinedAt")
    GROUP BY m."conversationId"`;
  const unreadByChat = new Map(unreadRows.map((row) => [row.conversationId, row.unread]));

  const rows = visible.map((m) => {
    const c = m.conversation;
    // Messages before I cleared the chat (or joined it) don't exist for me.
    const visibleFrom = latest(m.clearedAt, m.joinedAt);
    const last = c.messages[0];
    const other = c.type === "DIRECT" ? (c.members[0]?.user ?? null) : null;
    const chat: ChatListItem = {
      id: c.id,
      type: c.type,
      title: c.type === "GROUP" ? (c.title ?? "") : (other?.name ?? DELETED_USER_NAME),
      otherUser: other,
      lastMessage:
        last && last.createdAt > visibleFrom
          ? {
              body: last.deletedAt ? null : last.body,
              createdAt: last.createdAt,
              mine: last.senderId === user.id,
              photos: last.deletedAt ? 0 : last.attachments.filter((a) => isChatPhoto(a.mimeType)).length,
              files: last.deletedAt ? 0 : last.attachments.filter((a) => !isChatPhoto(a.mimeType)).length,
            }
          : null,
      unread: unreadByChat.get(c.id) ?? 0,
      pinned: !!m.pinnedAt,
    };
    return { chat, pinnedAt: m.pinnedAt?.getTime() ?? 0, activityAt: (c.lastMessageAt ?? c.createdAt).getTime() };
  });

  // Pinned chats first (most recently pinned on top), then everything else by newest message.
  rows.sort((a, b) => b.pinnedAt - a.pinnedAt || b.activityAt - a.activityAt);
  const chats = rows.map((row) => row.chat);
  return { chats, unreadTotal: chats.reduce((sum, chat) => sum + chat.unread, 0) };
}

export type ChatAttachment = { id: string; name: string; mimeType: string; size: number; width: number | null; height: number | null; url: string | null };
export type ChatMessage = { id: string; senderId: string | null; body: string | null; createdAt: Date; mine: boolean; attachments: ChatAttachment[] };

/**
 * Blocks between me and these people, in either direction. `byMe`: I blocked one of them;
 * `byThem`: one of them blocked me. Either one stops messages both ways.
 */
export async function blockStatus(userId: string, otherUserIds: string[]) {
  if (!otherUserIds.length) return { byMe: false, byThem: false };
  const rows = await prisma.userBlock.findMany({
    where: {
      // Administrators can't be blocked; an older block against one is ignored.
      blocked: { role: { not: "admin" } },
      OR: [
        { blockerId: userId, blockedId: { in: otherUserIds } },
        { blockerId: { in: otherUserIds }, blockedId: userId },
      ],
    },
    select: { blockerId: true },
  });
  return { byMe: rows.some((r) => r.blockerId === userId), byThem: rows.some((r) => r.blockerId !== userId) };
}

/**
 * One page of a chat's messages, oldest first, for display. `before` (a message id) loads the
 * page before that message when scrolling back. Also returns the other members' read times, for
 * "Parë" under my messages, and whether a block stops sending in this chat (it comes with every
 * load, so a block made mid-chat shows as soon as the chat refetches on its realtime signal).
 */
export async function getMessages(user: AppUser, conversationId: string, options: { before: string | null; limit: number }) {
  const me = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: user.id } },
    select: { leftAt: true, clearedAt: true, joinedAt: true },
  });
  if (!me || me.leftAt) throw new ApiError("NOT_FOUND", CHAT_NOT_FOUND);

  const rows = await prisma.message.findMany({
    where: { conversationId, createdAt: { gt: latest(me.clearedAt, me.joinedAt) } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    // One extra row tells whether there is an older page.
    take: options.limit + 1,
    ...(options.before ? { cursor: { id: options.before }, skip: 1 } : {}),
    select: {
      id: true,
      senderId: true,
      body: true,
      createdAt: true,
      deletedAt: true,
      attachments: { orderBy: { position: "asc" }, select: { id: true, objectKey: true, displayName: true, mimeType: true, sizeBytes: true, width: true, height: true } },
    },
  });
  const page = rows.slice(0, options.limit).reverse();

  const others = await prisma.conversationMember.findMany({
    where: { conversationId, userId: { not: user.id }, leftAt: null },
    select: { lastReadAt: true, user: { select: { id: true, name: true } } },
  });
  const blocked = await blockStatus(
    user.id,
    others.map((o) => o.user.id),
  );

  return {
    messages: await Promise.all(
      page.map(
        async (m): Promise<ChatMessage> => ({
          id: m.id,
          senderId: m.senderId,
          body: m.deletedAt ? null : m.body,
          createdAt: m.createdAt,
          mine: m.senderId === user.id,
          // A deleted message shows nothing of what it carried. Photos come with a short-lived link to show them.
          attachments: m.deletedAt
            ? []
            : await Promise.all(
                m.attachments.map(async (a) => ({
                  id: a.id,
                  name: a.displayName,
                  mimeType: a.mimeType,
                  size: a.sizeBytes,
                  width: a.width,
                  height: a.height,
                  url: isChatPhoto(a.mimeType) ? await photoLink(a) : null,
                })),
              ),
        }),
      ),
    ),
    hasMore: rows.length > options.limit,
    readBy: others.map((o) => ({ userId: o.user.id, name: o.user.name, lastReadAt: o.lastReadAt })),
    blocked,
  };
}

/** People I can start a chat with: every active account except me, by name. Empty search = everyone (first 20). */
export async function searchPeople(user: AppUser, { q }: { q: string }) {
  return prisma.user.findMany({
    where: {
      id: { not: user.id },
      banned: { not: true },
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    },
    orderBy: { name: "asc" },
    take: 20,
    select: { id: true, name: true, role: true },
  });
}
