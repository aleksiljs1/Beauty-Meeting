import "server-only";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/http";

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
  lastMessage: { body: string | null; createdAt: Date; mine: boolean } | null;
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
          messages: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { body: true, createdAt: true, senderId: true, deletedAt: true } },
        },
      },
    },
  });

  const visible = memberships.filter(({ hiddenAt, conversation: c }) => {
    if (!c.lastMessageAt) return c.createdById === user.id;
    return !hiddenAt || c.lastMessageAt > hiddenAt;
  });

  const rows = await Promise.all(
    visible.map(async (m) => {
      const c = m.conversation;
      // Messages before I cleared the chat (or joined it) don't exist for me.
      const visibleFrom = latest(m.clearedAt, m.joinedAt);
      const readUpTo = latest(m.lastReadAt, visibleFrom);
      const unread = await prisma.message.count({
        where: { conversationId: c.id, createdAt: { gt: readUpTo }, deletedAt: null, OR: [{ senderId: { not: user.id } }, { senderId: null }] },
      });
      const last = c.messages[0];
      const other = c.type === "DIRECT" ? (c.members[0]?.user ?? null) : null;
      const chat: ChatListItem = {
        id: c.id,
        type: c.type,
        title: c.type === "GROUP" ? (c.title ?? "") : (other?.name ?? DELETED_USER_NAME),
        otherUser: other,
        lastMessage:
          last && last.createdAt > visibleFrom ? { body: last.deletedAt ? null : last.body, createdAt: last.createdAt, mine: last.senderId === user.id } : null,
        unread,
        pinned: !!m.pinnedAt,
      };
      return { chat, pinnedAt: m.pinnedAt?.getTime() ?? 0, activityAt: (c.lastMessageAt ?? c.createdAt).getTime() };
    }),
  );

  // Pinned chats first (most recently pinned on top), then everything else by newest message.
  rows.sort((a, b) => b.pinnedAt - a.pinnedAt || b.activityAt - a.activityAt);
  const chats = rows.map((row) => row.chat);
  return { chats, unreadTotal: chats.reduce((sum, chat) => sum + chat.unread, 0) };
}

export type ChatMessage = { id: string; senderId: string | null; body: string | null; createdAt: Date; mine: boolean };

/**
 * One page of a chat's messages, oldest first, for display. `before` (a message id) loads the
 * page before that message when scrolling back. Also returns the other members' read times, for
 * "Parë" under my messages.
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
    select: { id: true, senderId: true, body: true, createdAt: true, deletedAt: true },
  });
  const page = rows.slice(0, options.limit).reverse();

  const others = await prisma.conversationMember.findMany({
    where: { conversationId, userId: { not: user.id }, leftAt: null },
    select: { lastReadAt: true, user: { select: { id: true, name: true } } },
  });

  return {
    messages: page.map((m): ChatMessage => ({ id: m.id, senderId: m.senderId, body: m.deletedAt ? null : m.body, createdAt: m.createdAt, mine: m.senderId === user.id })),
    hasMore: rows.length > options.limit,
    readBy: others.map((o) => ({ userId: o.user.id, name: o.user.name, lastReadAt: o.lastReadAt })),
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
