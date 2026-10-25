import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { createLesson, createUser, resetDatabase } from "@/test/fixtures";

const { dismissNotification, getLiveFeed, markLessonEnded, markLessonLive, markNotificationsRead } = await import("./live");
const { prisma } = await import("@/server/db");

const MIN = 60_000;

let admin: Awaited<ReturnType<typeof createUser>>;

beforeEach(async () => {
  await resetDatabase();
  admin = await createUser("admin");
});

async function demoLessonStartingNow() {
  const start = new Date(Date.now() - MIN);
  return createLesson(admin.id, {
    isDemo: true,
    scheduledStartAt: start,
    scheduledEndAt: new Date(start.getTime() + 180 * MIN),
    joinOpensAt: new Date(start.getTime() - 15 * MIN),
  });
}

async function enroll(lessonId: string, userId: string, extra: { revokedAt?: Date; accessExpiresAt?: Date } = {}) {
  await prisma.lessonEnrollment.create({ data: { lessonId, userId, source: "ADMIN", ...extra } });
}

describe("live lesson alerts", () => {
  it("reaches only eligible students, once per live occurrence", async () => {
    const lesson = await demoLessonStartingNow();
    const [enrolled, revoked, expired, stranger] = await Promise.all([1, 2, 3, 4].map(() => createUser("student")));
    const deactivated = await createUser("student", { banned: true });
    await enroll(lesson.id, enrolled.id);
    await enroll(lesson.id, revoked.id, { revokedAt: new Date() });
    await enroll(lesson.id, expired.id, { accessExpiresAt: new Date(Date.now() - MIN) });
    await enroll(lesson.id, deactivated.id);

    await markLessonLive(lesson.id, "demo", admin.id);
    await markLessonLive(lesson.id, "demo", admin.id); // duplicate event

    const recipients = await prisma.notification.findMany({ where: { type: "LESSON_LIVE" }, select: { userId: true } });
    expect(recipients.map((r) => r.userId)).toEqual([enrolled.id]);

    const feed = await getLiveFeed(enrolled);
    expect(feed.notifications).toHaveLength(1);
    expect(feed.notifications[0]).toMatchObject({ type: "LESSON_LIVE", active: true, canJoin: true, lessonTitle: lesson.title });
    expect((await getLiveFeed(stranger)).notifications).toHaveLength(0);
  });

  it("emails eligible students once, with a link that opens the lesson and joins", async () => {
    const lesson = await demoLessonStartingNow();
    const [enrolled, revoked] = await Promise.all([1, 2].map(() => createUser("student")));
    await enroll(lesson.id, enrolled.id);
    await enroll(lesson.id, revoked.id, { revokedAt: new Date() });

    await markLessonLive(lesson.id, "demo", admin.id);
    await markLessonLive(lesson.id, "demo", admin.id); // duplicate event: no second email

    // Sent in the background to the local Mailpit inbox (pinned in vitest.integration.config).
    const inbox = async (to: string) => {
      const res = await fetch(`http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
      return ((await res.json()) as { messages: { ID: string; Subject: string }[] }).messages;
    };
    let received: { ID: string; Subject: string }[] = [];
    for (let i = 0; i < 25 && received.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      received = await inbox(enrolled.email);
    }
    expect(received).toHaveLength(1);
    expect(received[0].Subject).toContain(lesson.title);
    const message = (await (await fetch(`http://localhost:8025/api/v1/message/${received[0].ID}`)).json()) as { Text: string };
    expect(message.Text).toContain(`/portal/mesimet/${lesson.id}?bashkohu=1`);

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await inbox(enrolled.email)).toHaveLength(1);
    expect(await inbox(revoked.email)).toHaveLength(0);
  });

  it("catches up after login: a student who signs in mid-lesson still sees the live alert", async () => {
    const lesson = await demoLessonStartingNow();
    const student = await createUser("student");
    await enroll(lesson.id, student.id);
    await markLessonLive(lesson.id, "demo", admin.id);
    // The first poll after sign-in happens long after the event.
    const feed = await getLiveFeed(student, new Date(Date.now() + 45 * MIN));
    expect(feed.notifications[0]).toMatchObject({ active: true, canJoin: true });
  });

  it("drops Join immediately when access is revoked, even though the old alert exists", async () => {
    const lesson = await demoLessonStartingNow();
    const student = await createUser("student");
    await enroll(lesson.id, student.id);
    await markLessonLive(lesson.id, "demo", admin.id);
    await prisma.lessonEnrollment.updateMany({ data: { revokedAt: new Date() } });

    const [notice] = (await getLiveFeed(student)).notifications;
    expect(notice).toMatchObject({ active: false, canJoin: false, lessonTitle: null });
  });

  it("drops Join when the student's deadline passes during the lesson", async () => {
    const lesson = await demoLessonStartingNow();
    const student = await createUser("student");
    const deadline = new Date(Date.now() + 30 * MIN);
    await enroll(lesson.id, student.id, { accessExpiresAt: deadline });
    await markLessonLive(lesson.id, "demo", admin.id);

    expect((await getLiveFeed(student, new Date(deadline.getTime() - 1))).notifications[0]).toMatchObject({ canJoin: true });
    // Expired notices remain as history (title only) but never offer Join.
    expect((await getLiveFeed(student, deadline)).notifications[0]).toMatchObject({ active: false, canJoin: false });
  });

  it("clears the alert when the lesson ends and never regresses to live", async () => {
    const lesson = await demoLessonStartingNow();
    const student = await createUser("student");
    await enroll(lesson.id, student.id);
    await markLessonLive(lesson.id, "demo", admin.id);
    await markLessonEnded(lesson.id, "demo", admin.id);

    expect((await getLiveFeed(student)).notifications[0]).toMatchObject({ active: false, canJoin: false });
    await expect(markLessonLive(lesson.id, "demo", admin.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses the demo simulation on real (non-demo) lessons", async () => {
    const lesson = await createLesson(admin.id, { isDemo: false });
    await expect(markLessonLive(lesson.id, "demo", admin.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("creates one 'starting soon' notice — not 'live' — in the 10 minutes before start", async () => {
    const start = new Date(Date.now() + 8 * MIN);
    const lesson = await createLesson(admin.id, { scheduledStartAt: start, joinOpensAt: new Date(start.getTime() - 15 * MIN) });
    const student = await createUser("student");
    await enroll(lesson.id, student.id);

    await getLiveFeed(student);
    const feed = await getLiveFeed(student); // repeated polls don't duplicate
    expect(feed.notifications).toHaveLength(1);
    expect(feed.notifications[0]).toMatchObject({ type: "LESSON_STARTING_SOON", active: true });
  });

  it("separates dismissing the pop-up from marking read, and scopes both to the owner", async () => {
    const lesson = await demoLessonStartingNow();
    const [student, other] = [await createUser("student"), await createUser("student")];
    await enroll(lesson.id, student.id);
    await markLessonLive(lesson.id, "demo", admin.id);
    const [notice] = (await getLiveFeed(student)).notifications;

    await dismissNotification(other, notice.id); // someone else's id: no effect
    expect((await getLiveFeed(student)).notifications[0].dismissedAt).toBeNull();

    await dismissNotification(student, notice.id);
    const afterDismiss = await getLiveFeed(student);
    expect(afterDismiss.notifications[0]).toMatchObject({ readAt: null, canJoin: true });
    expect(afterDismiss.notifications[0].dismissedAt).not.toBeNull();
    expect(afterDismiss.unreadCount).toBe(1);

    await markNotificationsRead(student, "all");
    expect((await getLiveFeed(student)).unreadCount).toBe(0);
  });
});
