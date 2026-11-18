import "server-only";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { sendMail } from "@/server/mail";
import { chatUnreadEmail } from "@/server/mail/templates";

/**
 * Chat for people who aren't on the site: a message still unread after CHAT_EMAIL_DELAY_MS earns
 * its reader one email ("Keni mesazhe të reja", without the text). One email per chat until they
 * read it; several chats due at once go into one email per person. Run by jobs/chat-emails.ts.
 */

/** Long enough that someone on the site reads it live and gets no email. */
export const CHAT_EMAIL_DELAY_MS = 15 * 60_000;

type Due = { memberId: string; conversationId: string; userId: string; emailedAt: Date | null; email: string; name: string; role: string };

/** Sends the emails that are due; returns how many were sent. */
export async function sendUnreadChatEmails(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - CHAT_EMAIL_DELAY_MS);
  // Members of a chat with someone else's message that is unread for them and older than the
  // delay, who haven't been emailed since they last read it, deleted it for themselves or joined.
  // Messages from someone they have blocked since don't count.
  const due = await prisma.$queryRaw<Due[]>`
    SELECT cm."id" AS "memberId", cm."conversationId", cm."userId", cm."emailedAt", u."email", u."name", u."role"
    FROM "ConversationMember" cm
    JOIN "user" u ON u."id" = cm."userId"
    WHERE cm."leftAt" IS NULL
      AND u."banned" IS NOT TRUE
      AND (cm."emailedAt" IS NULL OR cm."emailedAt" < GREATEST(cm."lastReadAt", cm."clearedAt", cm."joinedAt"))
      AND EXISTS (
        SELECT 1 FROM "Message" m
        WHERE m."conversationId" = cm."conversationId"
          AND m."deletedAt" IS NULL
          AND (m."senderId" IS NULL OR m."senderId" <> cm."userId")
          AND m."createdAt" > GREATEST(cm."lastReadAt", cm."clearedAt", cm."joinedAt")
          AND m."createdAt" <= ${cutoff}
          AND NOT EXISTS (SELECT 1 FROM "UserBlock" b WHERE b."blockerId" = cm."userId" AND b."blockedId" = m."senderId")
      )`;
  if (!due.length) return 0;

  const others = await prisma.conversationMember.findMany({
    where: { conversationId: { in: [...new Set(due.map((d) => d.conversationId))] }, leftAt: null },
    select: { conversationId: true, userId: true, user: { select: { name: true } } },
  });
  const academyName = (await prisma.academySettings.findUnique({ where: { id: 1 }, select: { name: true } }))?.name ?? "Akademia CEM";

  let sent = 0;
  for (const [userId, rows] of Map.groupBy(due, (d) => d.userId)) {
    // Claim each chat first (only if nobody else just did), so overlapping runs never send twice.
    const claimed: Due[] = [];
    for (const row of rows) {
      const { count } = await prisma.conversationMember.updateMany({ where: { id: row.memberId, emailedAt: row.emailedAt }, data: { emailedAt: now } });
      if (count) claimed.push(row);
    }
    if (!claimed.length) continue;

    const chats = new Set(claimed.map((row) => row.conversationId));
    const senders = [...new Set(others.filter((o) => chats.has(o.conversationId) && o.userId !== userId).map((o) => o.user.name))];
    const { email, name, role } = claimed[0];
    try {
      await sendMail(
        chatUnreadEmail({
          to: email,
          name,
          senders,
          // Opens the chat sidebar after signing in (components/chat/chat-sidebar.tsx).
          url: new URL(`${role === "admin" ? "/admin" : "/portal"}?mesazhet=1`, env.APP_URL).toString(),
          academyName,
        }),
      );
      sent += 1;
    } catch (error) {
      // Give the claims back: the next run tries again.
      console.error("[chat-emails] email failed", error);
      for (const row of claimed) {
        await prisma.conversationMember.updateMany({ where: { id: row.memberId, emailedAt: now }, data: { emailedAt: row.emailedAt } }).catch(() => undefined);
      }
    }
  }
  return sent;
}
