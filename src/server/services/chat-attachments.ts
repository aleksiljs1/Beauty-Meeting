import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { isChatPhoto } from "@/lib/chat";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/http";
import { bytesMatch, checkDeclaredFile, formatLimit, isInlineSafe, sanitizeDisplayName, SNIFF_BYTES } from "@/server/storage/file-types";
import { deleteObject, headObject, newObjectKey, presignGet, presignPut, readObjectHead, READ_URL_MAX_TTL_SECONDS } from "@/server/storage/storage";
import type { StartAttachmentInput } from "@/server/validation/chat";

/**
 * Photos and files in chats. Two steps, like lesson materials: the sender gets a presigned upload
 * URL for an unsent attachment and uploads straight to private storage (it starts as soon as the
 * file is picked, so sending is instant); sending the message then checks the real size and file
 * type and attaches it (claimAttachments, called by services/chat.ts inside the send transaction).
 *
 * Who sees what: only the chat's members, and only attachments of messages they can see (not
 * before they joined or deleted the chat for themselves, not of a deleted message). Links last at
 * most a minute; the chat asks for a fresh one whenever an old one has expired.
 *
 * Unsent uploads (picked, then the window was closed) are deleted after a day (deleteUnsentAttachments,
 * run hourly by jobs/chat-attachment-cleanup.ts).
 */

const ATTACHMENT_NOT_FOUND = "Skedari nuk u gjet.";
/** Uploads started per person per minute (a message holds at most 10). */
const STARTS_PER_MINUTE = 40;
/** Picked but not yet sent, per person: stops someone filling storage without ever sending. */
const MAX_UNSENT = 30;
/** Unsent uploads older than this are deleted. */
export const UNSENT_TTL_MS = 24 * 60 * 60_000;

/** Starts an upload of a photo or file into this chat. `canSend` is checked by the caller (services/chat.ts). */
export async function startChatAttachment(user: AppUser, conversationId: string, input: StartAttachmentInput, now = new Date()) {
  const check = checkDeclaredFile("chat", { filename: input.filename, mimeType: input.mimeType, sizeBytes: input.sizeBytes });
  if (!check.ok && check.reason === "type") {
    throw new ApiError("VALIDATION_FAILED", "Ky lloj skedari nuk lejohet. Lejohen foto (JPG, PNG, WebP), PDF, Word dhe PowerPoint.");
  }
  if (!check.ok) throw new ApiError("VALIDATION_FAILED", `Skedari është shumë i madh (maksimumi ${formatLimit(check.maxBytes)}).`);

  const [recent, unsent] = await Promise.all([
    prisma.chatAttachment.count({ where: { uploaderId: user.id, createdAt: { gt: new Date(now.getTime() - 60_000) } } }),
    prisma.chatAttachment.count({ where: { uploaderId: user.id, messageId: null } }),
  ]);
  if (recent >= STARTS_PER_MINUTE || unsent >= MAX_UNSENT) {
    throw new ApiError("RATE_LIMITED", "Po ngarkoni shumë skedarë. Dërgoni ose hiqni ata që keni zgjedhur dhe provoni përsëri.");
  }

  const photo = isChatPhoto(check.mime);
  const objectKey = newObjectKey("chat", conversationId);
  const created = await prisma.chatAttachment.create({
    data: {
      conversationId,
      uploaderId: user.id,
      objectKey,
      displayName: sanitizeDisplayName(input.filename),
      mimeType: check.mime,
      sizeBytes: input.sizeBytes,
      width: photo ? (input.width ?? null) : null,
      height: photo ? (input.height ?? null) : null,
      createdAt: now,
    },
    select: { id: true },
  });
  const uploadUrl = await presignPut({ key: objectKey, contentType: check.mime, contentLength: input.sizeBytes });
  return { id: created.id, uploadUrl, headers: { "Content-Type": check.mime } };
}

/** Removes a picked photo or file before sending (the ✕ on it). Only my own unsent ones. */
export async function removeUnsentAttachment(user: AppUser, conversationId: string, attachmentId: string) {
  const row = await prisma.chatAttachment.findFirst({ where: { id: attachmentId, conversationId, uploaderId: user.id, messageId: null }, select: { id: true, objectKey: true } });
  if (!row) return; // already sent or removed: nothing to do
  await prisma.chatAttachment.delete({ where: { id: row.id } });
  await deleteObject(row.objectKey).catch(() => undefined); // never uploaded, or a retry later: harmless
}

/**
 * Checks my unsent uploads for this message: they exist, are mine, belong to this chat, finished
 * uploading with the declared size, and their first bytes match the declared type. A file that
 * fails is deleted and the message isn't sent. Runs before the send transaction (storage calls).
 */
export async function verifyAttachments(user: AppUser, conversationId: string, attachmentIds: string[]) {
  if (!attachmentIds.length) return;
  const rows = await prisma.chatAttachment.findMany({
    where: { id: { in: attachmentIds }, conversationId, uploaderId: user.id, messageId: null },
    select: { id: true, objectKey: true, mimeType: true, sizeBytes: true },
  });
  if (rows.length !== attachmentIds.length) throw new ApiError("VALIDATION_FAILED", "Një nga skedarët nuk u gjet. Hiqeni dhe zgjidheni përsëri.");
  for (const row of rows) {
    const head = await headObject(row.objectKey);
    const valid = head !== null && head.size === row.sizeBytes && bytesMatch("chat", row.mimeType, await readObjectHead(row.objectKey, SNIFF_BYTES));
    if (!valid) {
      await prisma.chatAttachment.delete({ where: { id: row.id } });
      if (head) await deleteObject(row.objectKey).catch(() => undefined);
      throw new ApiError("VALIDATION_FAILED", "Një skedar nuk u ngarkua plotësisht ose nuk është ai që duket. Hiqeni dhe provoni përsëri.");
    }
  }
}

/** Inside the send transaction: attaches the verified uploads to the new message, in the order picked. */
export async function claimAttachments(tx: Prisma.TransactionClient, userId: string, conversationId: string, messageId: string, attachmentIds: string[]) {
  for (const [position, id] of attachmentIds.entries()) {
    // Only if still unsent: a second send of the same uploads (double tap, two tabs) fails and rolls back.
    const { count } = await tx.chatAttachment.updateMany({ where: { id, conversationId, uploaderId: userId, messageId: null }, data: { messageId, position } });
    if (count !== 1) throw new ApiError("CONFLICT", "Ky skedar është dërguar tashmë.");
  }
}

/** A short-lived link for showing a photo in the chat. */
export function photoLink(row: { objectKey: string; mimeType: string; displayName: string }) {
  return presignGet({ key: row.objectKey, expiresIn: READ_URL_MAX_TTL_SECONDS, contentType: row.mimeType, filename: row.displayName, disposition: "inline" });
}

/**
 * A fresh link to a photo or file of a message I can see: to show it (photos, PDFs open in the
 * browser) or to download it. Answers "not found" for anything else, so nobody can probe ids.
 */
export async function attachmentLink(user: AppUser, conversationId: string, attachmentId: string, download: boolean) {
  const me = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: user.id } },
    select: { leftAt: true, clearedAt: true, joinedAt: true },
  });
  if (!me || me.leftAt) throw new ApiError("NOT_FOUND", ATTACHMENT_NOT_FOUND);
  const row = await prisma.chatAttachment.findFirst({
    where: { id: attachmentId, conversationId },
    select: { objectKey: true, mimeType: true, displayName: true, uploaderId: true, message: { select: { createdAt: true, deletedAt: true } } },
  });
  const visibleFrom = Math.max(me.clearedAt?.getTime() ?? 0, me.joinedAt.getTime());
  const visible = row && (row.message ? !row.message.deletedAt && row.message.createdAt.getTime() > visibleFrom : row.uploaderId === user.id);
  if (!row || !visible) throw new ApiError("NOT_FOUND", ATTACHMENT_NOT_FOUND);
  const inline = !download && isInlineSafe("chat", row.mimeType);
  const url = await presignGet({ key: row.objectKey, expiresIn: READ_URL_MAX_TTL_SECONDS, contentType: row.mimeType, filename: row.displayName, disposition: inline ? "inline" : "attachment" });
  return { url };
}

/** Deletes uploads that were never sent (older than a day). Returns how many. */
export async function deleteUnsentAttachments(now = new Date()): Promise<number> {
  const stale = await prisma.chatAttachment.findMany({
    where: { messageId: null, createdAt: { lt: new Date(now.getTime() - UNSENT_TTL_MS) } },
    select: { id: true, objectKey: true },
    take: 500,
  });
  let deleted = 0;
  for (const row of stale) {
    try {
      await deleteObject(row.objectKey); // a missing object (upload never finished) is fine for S3 deletes
      // Only if still unsent: it can't have been sent meanwhile (too old), but never delete a sent one.
      deleted += (await prisma.chatAttachment.deleteMany({ where: { id: row.id, messageId: null } })).count;
    } catch (error) {
      console.error("[chat-attachments] cleanup failed for", row.id, (error as Error).message);
    }
  }
  return deleted;
}
