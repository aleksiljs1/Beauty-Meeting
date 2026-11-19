import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/http";
import { blockStatus } from "@/server/queries/chat";
import { publishChatChanged } from "@/server/realtime/publish";
import type { SendMessageInput, StartAttachmentInput, StartChatInput, UpdateChatInput } from "@/server/validation/chat";
import { claimAttachments, startChatAttachment, verifyAttachments } from "./chat-attachments";

/**
 * Chat rules: starting a chat, sending, reading, pinning and deleting a chat for me.
 * Everyone can chat with everyone. Input arrives already checked by the route against the
 * schemas in validation/chat.ts (message length, ids); this file checks who may do what.
 *
 * Live delivery: after each change the affected people get a "chat changed" signal through the
 * realtime service (no data travels with it); their open chats refetch through the API.
 *
 * Blocking: a block in either direction stops both people from sending; unblocking lets the chat
 * continue. Both are signalled, so an open chat locks or unlocks mid-conversation. Administrators
 * can't be blocked (the academy must always reach its students).
 *
 * Offline: someone who doesn't read a message within a few minutes gets one email about it
 * (services/chat-emails.ts).
 *
 * Photos and files: uploaded first, then sent with the message (services/chat-attachments.ts).
 *
 * Not here yet: "delete a message for everyone" (waiting on the client's answer).
 */

/** At most this many messages per person per minute (stops floods and runaway scripts). */
const MESSAGES_PER_MINUTE = 30;

/** Same reply for "no such chat" and "not your chat", so nobody can probe other people's chats. */
const CHAT_NOT_FOUND = "Biseda nuk u gjet.";
/** Same wording whoever blocked whom: the blocked person isn't told who did it. */
const CHAT_BLOCKED = "Nuk mund të dërgoni më mesazhe në këtë bisedë.";

/** My membership row in this chat, or a "not found" error if I'm not (or no longer) in it. */
async function requireMembership(user: AppUser, conversationId: string) {
  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: user.id } },
    select: { id: true, leftAt: true },
  });
  if (!member || member.leftAt) throw new ApiError("NOT_FOUND", CHAT_NOT_FOUND);
  return member;
}

/** Signals everyone still in the chat (including my other tabs) that it changed. */
async function signalMembers(conversationId: string) {
  const members = await prisma.conversationMember.findMany({ where: { conversationId, leftAt: null }, select: { userId: true } });
  await publishChatChanged(members.map((m) => m.userId));
}

/** Opens my chat with this person, creating it the first time. Returns the chat's id. */
export async function startDirectChat(user: AppUser, input: StartChatInput, now = new Date()): Promise<{ id: string }> {
  // Not a chat with myself (cheap check first: no database trip).
  if (input.userId === user.id) {
    throw new ApiError("VALIDATION_FAILED", "Nuk mund të nisni një bisedë me veten!");
  }

  // The other person exists and isn't deactivated. Both cases answer "not found", so a
  // deactivated account can't be told apart from one that never existed.
  const otherUser = await prisma.user.findUnique({
    where: { id: input.userId, banned: { not: true } },
    select: { id: true },
  });
  if (!otherUser) {
    throw new ApiError("NOT_FOUND", "Ky person nuk u gjet.");
  }

  // Look for an existing chat between us. Both ids, sorted, so it's the same key whoever starts
  // the chat; the key is unique in the database, so a pair has at most one chat.
  const directKey = [user.id, input.userId].sort().join(":");
  const existingChat = await prisma.conversation.findUnique({
    where: { directKey },
    select: { id: true },
  });

  // Already talked: open that chat instead of making a second one. If I had deleted it for
  // myself, it comes back to my list (its old history stays cleared for me).
  if (existingChat) {
    await prisma.conversationMember.updateMany({
      where: { conversationId: existingChat.id, userId: user.id },
      data: { hiddenAt: null },
    });
    await publishChatChanged([user.id]);
    return { id: existingChat.id };
  }

  // None yet: create the chat and both member rows. One `create` with nested members is
  // all-or-nothing: either all three rows are saved or none are.
  try {
    const created = await prisma.conversation.create({
      data: {
        type: "DIRECT",
        directKey,
        createdById: user.id,
        members: { create: [{ userId: user.id, joinedAt: now }, { userId: input.userId, joinedAt: now }] },
      },
      select: { id: true },
    });
    // Only my other tabs: an empty chat isn't on the other person's list yet.
    await publishChatChanged([user.id]);
    return { id: created.id };
  } catch (error) {
    // Both people pressed "message" at the same moment: the other request created the chat a
    // split second earlier and the unique key refused ours. Open theirs.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const chat = await prisma.conversation.findUnique({ where: { directKey }, select: { id: true } });
      if (chat) return { id: chat.id };
    }
    throw error;
  }
}

/** I'm in this chat and may send to it: no block either way, and the other person is still active. */
async function requireCanSend(user: AppUser, conversationId: string) {
  await requireMembership(user, conversationId);

  // A block between me and the other person, in either direction, stops the message. Checked here
  // on every send, so a screen that hasn't caught up with a new block can't get around it.
  const others = await prisma.conversationMember.findMany({
    where: { conversationId, userId: { not: user.id }, leftAt: null },
    select: { userId: true },
  });
  const blocked = await blockStatus(
    user.id,
    others.map((o) => o.userId),
  );
  if (blocked.byMe || blocked.byThem) throw new ApiError("FORBIDDEN", CHAT_BLOCKED);

  // A deactivated account can't read anything: say so instead of sending into the void.
  const inactive = await prisma.user.count({ where: { id: { in: others.map((o) => o.userId) }, banned: true } });
  if (inactive) throw new ApiError("FORBIDDEN", "Ky person nuk është më aktiv. Mesazhi nuk u dërgua.");
}

/** Starts uploading a photo or file to send in this chat (same "may I send" rules as a message). */
export async function startAttachment(user: AppUser, conversationId: string, input: StartAttachmentInput) {
  await requireCanSend(user, conversationId);
  return startChatAttachment(user, conversationId, input);
}

/**
 * Sends a message to a chat I'm in: text, photos and files (uploaded beforehand), or both.
 * Returns the new message's id and time.
 */
export async function sendMessage(
  user: AppUser,
  conversationId: string,
  input: Omit<SendMessageInput, "attachmentIds"> & { attachmentIds?: string[] },
  now = new Date(),
) {
  await requireCanSend(user, conversationId);
  const attachmentIds = input.attachmentIds ?? [];

  // Rate limit: count what I sent in the last minute.
  const sentLastMinute = await prisma.message.count({
    where: { senderId: user.id, createdAt: { gt: new Date(now.getTime() - 60_000) } },
  });
  if (sentLastMinute >= MESSAGES_PER_MINUTE) {
    throw new ApiError("RATE_LIMITED", "Po dërgoni shumë mesazhe. Prisni pak dhe provoni përsëri.");
  }

  // Photos and files: really uploaded, and really the type they claim (storage calls, so before the transaction).
  await verifyAttachments(user, conversationId, attachmentIds);

  // All together or not at all: the message and its attachments, the chat's "last message" time
  // (sorts the chat list, and brings the chat back for anyone who had deleted it for themselves),
  // and my read time (my own message is never "unread" for me).
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: { conversationId, senderId: user.id, body: input.body, createdAt: now },
      select: { id: true, createdAt: true },
    });
    await claimAttachments(tx, user.id, conversationId, created.id, attachmentIds);
    await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now } });
    await tx.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: user.id } },
      data: { lastReadAt: now, hiddenAt: null },
    });
    return created;
  });
  await signalMembers(conversationId);
  return message;
}

/** I've seen everything in this chat up to now (drives "Parë" for the other person and my unread count). */
export async function markChatRead(user: AppUser, conversationId: string, now = new Date()) {
  // One query that also checks membership: it only updates my row, if I'm in the chat.
  const { count } = await prisma.conversationMember.updateMany({
    where: { conversationId, userId: user.id, leftAt: null },
    data: { lastReadAt: now },
  });
  if (count === 0) throw new ApiError("NOT_FOUND", CHAT_NOT_FOUND);
  // The others see "Parë"; my other tabs drop the unread badge.
  await signalMembers(conversationId);
}

/**
 * Pin/unpin, or delete the chat for me. Only my own row changes: the other person keeps the chat,
 * its history and their pin.
 */
export async function updateChat(user: AppUser, conversationId: string, input: UpdateChatInput, now = new Date()) {
  const data: Prisma.ConversationMemberUpdateManyMutationInput = {};
  if (input.pinned !== undefined) data.pinnedAt = input.pinned ? now : null;
  if (input.hidden) {
    // Delete for me: off my list until a new message arrives, its history hidden from me for
    // good, and no longer pinned.
    data.hiddenAt = now;
    data.clearedAt = now;
    data.pinnedAt = null;
  }

  const { count } = await prisma.conversationMember.updateMany({
    where: { conversationId, userId: user.id, leftAt: null },
    data,
  });
  if (count === 0) throw new ApiError("NOT_FOUND", CHAT_NOT_FOUND);
  await publishChatChanged([user.id]); // pins and deletions are mine only
}

/**
 * Blocks this person: from now on neither of us can send to the other, until I unblock. Blocking
 * twice is harmless. Both of us are signalled, so an open chat locks immediately on both sides.
 */
export async function blockUser(user: AppUser, otherUserId: string) {
  if (otherUserId === user.id) throw new ApiError("VALIDATION_FAILED", "Nuk mund të bllokoni veten.");
  const other = await prisma.user.findUnique({ where: { id: otherUserId }, select: { id: true, role: true } });
  if (!other) throw new ApiError("NOT_FOUND", "Ky person nuk u gjet.");
  // The academy must always be able to reach its students: administrators can't be blocked.
  if (other.role === "admin") throw new ApiError("VALIDATION_FAILED", "Akademia nuk mund të bllokohet.");
  await prisma.userBlock.createMany({ data: [{ blockerId: user.id, blockedId: otherUserId }], skipDuplicates: true });
  await publishChatChanged([user.id, otherUserId]);
}

/** Removes my block on this person. If they haven't blocked me too, the chat can continue. */
export async function unblockUser(user: AppUser, otherUserId: string) {
  await prisma.userBlock.deleteMany({ where: { blockerId: user.id, blockedId: otherUserId } });
  await publishChatChanged([user.id, otherUserId]);
}
