import "server-only";
import { prisma } from "@/server/db";

/** Must match REALTIME_CHANNEL in src/realtime/server.ts. */
const CHANNEL = "academy_realtime";
// pg_notify payloads are limited to ~8 KB; user ids are ≤ 36 chars.
const USERS_PER_MESSAGE = 150;

/**
 * Tells the realtime service that these users' feeds changed. Best effort by design: a missed
 * signal is recovered by the client's resync on (re)connect, on focus and its slow safety poll,
 * so a failure here never fails the business operation that triggered it.
 */
export async function publishFeedChanged(userIds: Iterable<string>) {
  await publish("feed", userIds);
}

/**
 * Tells these users that one of their chats changed (new message, read receipt, pin…). A separate
 * signal from the feed: the portal re-renders pages on feed signals, which a chat message must not do.
 */
export async function publishChatChanged(userIds: Iterable<string>) {
  await publish("chat", userIds);
}

async function publish(type: "feed" | "chat", userIds: Iterable<string>) {
  const unique = [...new Set(userIds)];
  for (let i = 0; i < unique.length; i += USERS_PER_MESSAGE) {
    const payload = JSON.stringify({ type, users: unique.slice(i, i + USERS_PER_MESSAGE) });
    try {
      await prisma.$queryRaw`SELECT pg_notify(${CHANNEL}, ${payload})::text`;
    } catch (error) {
      console.error("[realtime] publish failed", error);
    }
  }
}

/** Users whose feed depends on this lesson (active, non-revoked enrolments). */
export async function publishLessonChanged(lessonId: string) {
  const enrollments = await prisma.lessonEnrollment.findMany({ where: { lessonId, revokedAt: null }, select: { userId: true } });
  await publishFeedChanged(enrollments.map((e) => e.userId));
}
