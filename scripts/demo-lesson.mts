/**
 * Drives the seeded demo lesson from the terminal (local development only).
 *   npm run demo -- live     → lesson goes LIVE, enrolled students get the pop-up
 *   npm run demo -- end      → lesson ENDS, the pop-up disappears
 *   npm run demo -- reset    → back to SCHEDULED, starting ~20 min from now, alerts cleared
 */
import "dotenv/config";

if (process.env.NODE_ENV === "production") {
  console.error("Development only.");
  process.exit(1);
}

const action = process.argv[2];
if (!["live", "end", "reset"].includes(action ?? "")) {
  console.error("Usage: npm run demo -- live | end | reset");
  process.exit(1);
}

const { prisma } = await import("@/server/db");
const { markLessonEnded, markLessonLive } = await import("@/server/services/live");
const { publishLessonChanged } = await import("@/server/realtime/publish");

const lesson = await prisma.lesson.findFirst({ where: { isDemo: true }, orderBy: { createdAt: "asc" } });
if (!lesson) {
  console.error("No demo lesson found — run npm run db:seed first.");
  process.exit(1);
}

if (action === "live") {
  // The join window must be open for the Join button; move it if the lesson was scheduled later.
  if (lesson.joinOpensAt > new Date()) {
    await prisma.lesson.update({ where: { id: lesson.id }, data: { joinOpensAt: new Date(Date.now() - 60_000) } });
  }
  await markLessonLive(lesson.id, "demo", null);
  console.log(`LIVE: "${lesson.title}"`);
} else if (action === "end") {
  await markLessonEnded(lesson.id, "demo", null);
  console.log(`ENDED: "${lesson.title}"`);
} else {
  const start = new Date(Date.now() + 20 * 60_000);
  await prisma.notification.deleteMany({ where: { lessonId: lesson.id, type: { in: ["LESSON_LIVE", "LESSON_STARTING_SOON"] } } });
  await prisma.lesson.update({
    where: { id: lesson.id },
    data: {
      meetingStatus: "SCHEDULED",
      liveStartedAt: null,
      liveEndedAt: null,
      scheduledStartAt: start,
      scheduledEndAt: new Date(start.getTime() + 3 * 3_600_000),
      joinOpensAt: new Date(start.getTime() - 15 * 60_000),
    },
  });
  await publishLessonChanged(lesson.id);
  console.log(`RESET: "${lesson.title}" starts at ${start.toISOString()}`);
}
await prisma.$disconnect();
