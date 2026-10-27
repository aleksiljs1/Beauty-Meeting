import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { createLesson, createUser, resetDatabase } from "@/test/fixtures";

const { setLessonPublication, updateLesson } = await import("./lessons");
const { getLiveFeed, notifyRecordingReady } = await import("./live");
const { prisma } = await import("@/server/db");

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

let admin: Awaited<ReturnType<typeof createUser>>;

beforeEach(async () => {
  await resetDatabase();
  admin = await createUser("admin");
});

async function enroll(lessonId: string, userId: string, extra: { revokedAt?: Date; accessExpiresAt?: Date } = {}) {
  await prisma.lessonEnrollment.create({ data: { lessonId, userId, source: "ADMIN", ...extra } });
}

/** A published lesson in two days with one eligible, one revoked and one expired student. */
async function lessonWithStudents() {
  const lesson = await createLesson(admin.id, { scheduledStartAt: new Date(Date.now() + 2 * DAY), scheduledEndAt: new Date(Date.now() + 2 * DAY + 120 * MIN) });
  const [enrolled, revoked, expired] = await Promise.all([1, 2, 3].map(() => createUser("student")));
  await enroll(lesson.id, enrolled.id);
  await enroll(lesson.id, revoked.id, { revokedAt: new Date() });
  await enroll(lesson.id, expired.id, { accessExpiresAt: new Date(Date.now() - MIN) });
  return { lesson, enrolled, revoked, expired };
}

const noticesOf = (type: "LESSON_CANCELLED" | "LESSON_RESCHEDULED" | "RECORDING_READY") =>
  prisma.notification.findMany({ where: { type }, select: { userId: true } }).then((rows) => rows.map((r) => r.userId));

/** Emails arrive in the local Mailpit inbox (pinned in vitest.integration.config), in the background. */
async function inbox(to: string, expected: number) {
  const search = async () => {
    const res = await fetch(`http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    return ((await res.json()) as { messages: { Subject: string }[] }).messages;
  };
  let messages = await search();
  for (let i = 0; i < 25 && messages.length < expected; i++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    messages = await search();
  }
  return messages;
}

describe("telling students about lesson changes", () => {
  it("cancelling a published lesson notifies eligible students in the site and by email", async () => {
    const { lesson, enrolled, revoked, expired } = await lessonWithStudents();
    await setLessonPublication(lesson.id, "CANCELLED", admin);

    expect(await noticesOf("LESSON_CANCELLED")).toEqual([enrolled.id]);
    const [notice] = (await getLiveFeed(enrolled)).notifications;
    expect(notice).toMatchObject({ type: "LESSON_CANCELLED", lessonTitle: lesson.title, active: false });

    const mail = await inbox(enrolled.email, 1);
    expect(mail).toHaveLength(1);
    expect(mail[0].Subject).toContain("anulua");
    for (const other of [revoked, expired]) expect(await inbox(other.email, 0)).toHaveLength(0);
  });

  it("closes a 'starting soon' pop-up when the lesson is cancelled", async () => {
    const lesson = await createLesson(admin.id, { scheduledStartAt: new Date(Date.now() + 5 * MIN), joinOpensAt: new Date(Date.now() - MIN) });
    const student = await createUser("student");
    await enroll(lesson.id, student.id);
    expect((await getLiveFeed(student)).notifications[0]).toMatchObject({ type: "LESSON_STARTING_SOON", active: true });

    await setLessonPublication(lesson.id, "CANCELLED", admin);
    const feed = await getLiveFeed(student);
    expect(feed.notifications.find((n) => n.type === "LESSON_STARTING_SOON")).toMatchObject({ active: false });
  });

  it("doesn't notify about drafts students never saw", async () => {
    const { lesson } = await lessonWithStudents();
    await prisma.lesson.update({ where: { id: lesson.id }, data: { publication: "DRAFT" } });
    await setLessonPublication(lesson.id, "CANCELLED", admin);
    expect(await noticesOf("LESSON_CANCELLED")).toEqual([]);
  });

  it("moving a published lesson notifies once per new time, with the new time in the email", async () => {
    const { lesson, enrolled } = await lessonWithStudents();
    const newStart = new Date(lesson.scheduledStartAt.getTime() + DAY);
    const move = { scheduledStartAt: newStart, scheduledEndAt: new Date(newStart.getTime() + 120 * MIN) };

    await updateLesson(lesson.id, move, false, admin);
    await updateLesson(lesson.id, move, false, admin); // saved again: no second notice
    await updateLesson(lesson.id, { title: "Titull i ri" }, false, admin); // not a time change
    expect(await noticesOf("LESSON_RESCHEDULED")).toEqual([enrolled.id]);

    const mail = await inbox(enrolled.email, 1);
    expect(mail).toHaveLength(1);
    expect(mail[0].Subject).toContain("Orari i mësimit ndryshoi");
  });

  it("drops a 'starting soon' pop-up for the old time when the lesson moves", async () => {
    const lesson = await createLesson(admin.id, { scheduledStartAt: new Date(Date.now() + 5 * MIN), joinOpensAt: new Date(Date.now() - MIN) });
    const student = await createUser("student");
    await enroll(lesson.id, student.id);
    await getLiveFeed(student); // creates the "starting soon" notice

    const later = new Date(Date.now() + DAY);
    await updateLesson(lesson.id, { scheduledStartAt: later, scheduledEndAt: new Date(later.getTime() + 120 * MIN), joinOpensAt: new Date(later.getTime() - 15 * MIN) }, false, admin);
    const feed = await getLiveFeed(student);
    expect(feed.notifications.find((n) => n.type === "LESSON_STARTING_SOON")).toMatchObject({ active: false });
    expect(feed.notifications.find((n) => n.type === "LESSON_RESCHEDULED")).toBeDefined();
  });

  it("saving the form unchanged is not logged or announced as a change", async () => {
    const { lesson } = await lessonWithStudents(); // summary/details are null
    await updateLesson(lesson.id, { title: lesson.title, summary: "", details: "  " }, false, admin);
    expect(await prisma.auditLog.count({ where: { action: "lesson.update" } })).toBe(0);
  });

  it("tells only students who can watch it that a recording is ready", async () => {
    const { lesson, enrolled } = await lessonWithStudents();
    await notifyRecordingReady(lesson.id, "rec-1");
    expect(await noticesOf("RECORDING_READY")).toEqual([enrolled.id]);

    await prisma.lesson.update({ where: { id: lesson.id }, data: { publication: "ARCHIVED" } });
    await notifyRecordingReady(lesson.id, "rec-2");
    expect(await noticesOf("RECORDING_READY")).toHaveLength(1);
  });
});
