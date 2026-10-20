/** TEMPORARY verification helper for the student-side work. Delete after use. */
import "dotenv/config";

const { prisma } = await import("@/server/db");
const { markLessonLive, markLessonEnded } = await import("@/server/services/live");
const { createInvitation } = await import("@/server/services/invitations");

const action = process.argv[2];
const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@akademia.local" }, select: { id: true, name: true, email: true, role: true } });
const demo = await prisma.lesson.findFirstOrThrow({ where: { isDemo: true } });
const lessons = await prisma.lesson.findMany({ select: { id: true, title: true, meetingStatus: true, publication: true, scheduledStartAt: true, joinOpensAt: true, accessExpiresAt: true } });
const sara = await prisma.user.findUniqueOrThrow({ where: { email: "sara@akademia.local" } });
const upcoming = lessons.find((l) => l.title === "Stilimi për ceremoni")!;

switch (action) {
  case "info":
    console.log(JSON.stringify({ demoId: demo.id, lessons }, null, 2));
    console.log("sara enrolments", await prisma.lessonEnrollment.findMany({ where: { userId: sara.id }, select: { lessonId: true, source: true } }));
    break;
  case "live":
    await markLessonLive(demo.id, "demo", admin.id);
    console.log("live", await prisma.lesson.findUnique({ where: { id: demo.id }, select: { meetingStatus: true, liveStartedAt: true } }));
    break;
  case "end":
    await markLessonEnded(demo.id, "demo", admin.id);
    console.log("ended", await prisma.lesson.findUnique({ where: { id: demo.id }, select: { meetingStatus: true, liveEndedAt: true } }));
    break;
  case "restore": {
    await prisma.lesson.update({ where: { id: demo.id }, data: { meetingStatus: "SCHEDULED", liveStartedAt: null, liveEndedAt: null } });
    const removed = await prisma.notification.deleteMany({ where: { lessonId: demo.id, type: "LESSON_LIVE" } });
    console.log("restored demo; deleted LESSON_LIVE notifications:", removed.count);
    break;
  }
  case "invite": {
    const inv = await createInvitation({ lessonId: upcoming.id, redeemUntil: new Date(Date.now() + 2 * 3_600_000), maxRedemptions: 5 }, { ...admin, role: "admin" });
    console.log(JSON.stringify(inv));
    break;
  }
  case "cleanup-invite": {
    const id = process.argv[3];
    const enrol = await prisma.lessonEnrollment.deleteMany({ where: { lessonId: upcoming.id, userId: sara.id } });
    const inv = await prisma.lessonInvitation.deleteMany({ where: { id } });
    console.log("deleted sara enrolment:", enrol.count, "deleted test invitation:", inv.count);
    break;
  }
  default:
    console.log("usage: info | live | end | restore | invite | cleanup-invite <invitationId>");
}
await prisma.$disconnect();
