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
  const unique = [...new Set(userIds)];
  for (let i = 0; i < unique.length; i += USERS_PER_MESSAGE) {
    const payload = JSON.stringify({ type: "feed", users: unique.slice(i, i + USERS_PER_MESSAGE) });
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
