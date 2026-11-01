import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { createLesson, createUser, resetDatabase } from "@/test/fixtures";

const { saveReminderSettings, sendDueLessonReminders } = await import("./admin-reminders");
const { prisma } = await import("@/server/db");

const MIN = 60_000;
const at = (minutesFromNow: number) => {
  const start = new Date(Date.now() + minutesFromNow * MIN);
  return { scheduledStartAt: start, scheduledEndAt: new Date(start.getTime() + 60 * MIN), joinOpensAt: new Date(start.getTime() - 15 * MIN) };
};

/** Reminder emails land in the local Mailpit inbox (pinned in vitest.integration.config). */
async function subjectsTo(to: string, expected: number) {
  const search = async () => {
    const res = await fetch(`http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    return ((await res.json()) as { messages: { Subject: string }[] }).messages.map((m) => m.Subject);
  };
  let subjects = await search();
  for (let i = 0; i < 25 && subjects.length < expected; i++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    subjects = await search();
  }
  return subjects;
}

let admin: Awaited<ReturnType<typeof createUser>>;

beforeEach(async () => {
  await resetDatabase();
  admin = await createUser("admin");
});

describe("admin reminder before lessons", () => {
  it("emails once about each published lesson starting within the chosen time", async () => {
    await saveReminderSettings(admin, { enabled: true, minutes: 30, email: "" });
    const soon = await createLesson(admin.id, { title: "Grimi i natës", ...at(20) });
    await createLesson(admin.id, { title: "Më vonë", ...at(90) });
    await createLesson(admin.id, { title: "Draft", publication: "DRAFT", ...at(10) });
    await createLesson(admin.id, { title: "Ka nisur", meetingStatus: "LIVE", ...at(5) });

    expect(await sendDueLessonReminders()).toBe(1);
    expect(await sendDueLessonReminders()).toBe(0); // the next minute: already reminded

    const subjects = await subjectsTo(admin.email, 1);
    expect(subjects).toEqual([expect.stringContaining("Grimi i natës")]);
    expect(await prisma.adminLessonReminder.findMany({ select: { lessonId: true } })).toEqual([{ lessonId: soon.id }]);
  });

  it("reminds again when the lesson is moved, and sends to the chosen address", async () => {
    const other = `rikujtim-${admin.id.slice(0, 6)}@test.local`;
    await saveReminderSettings(admin, { enabled: true, minutes: 60, email: other });
    const lesson = await createLesson(admin.id, at(30));

    expect(await sendDueLessonReminders()).toBe(1);
    await prisma.lesson.update({ where: { id: lesson.id }, data: at(45) });
    expect(await sendDueLessonReminders()).toBe(1);

    expect(await subjectsTo(other, 2)).toHaveLength(2);
  });

  it("sends nothing when reminders are off", async () => {
    await saveReminderSettings(admin, { enabled: false, minutes: 60, email: "" });
    await createLesson(admin.id, at(10));
    expect(await sendDueLessonReminders()).toBe(0);
  });
});

describe("class about to start (admin banner)", () => {
  it("lists the running class and those starting within the admin's reminder time, live first", async () => {
    const { getClassAlerts } = await import("@/server/queries/admin");
    await saveReminderSettings(admin, { enabled: false, minutes: 30, email: "" });
    const soon = await createLesson(admin.id, { title: "Pas 20 minutash", ...at(20) });
    const draft = await createLesson(admin.id, { title: "Draft", publication: "DRAFT", ...at(25) });
    const live = await createLesson(admin.id, { title: "Live", meetingStatus: "LIVE", ...at(-10) });
    await createLesson(admin.id, { title: "Më vonë", ...at(90) });
    await createLesson(admin.id, { title: "Anuluar", publication: "CANCELLED", ...at(5) });

    const { leadMinutes, alerts } = await getClassAlerts(admin.id);
    expect(leadMinutes).toBe(30);
    expect(alerts.map((a) => a.id)).toEqual([live.id, soon.id, draft.id]);
    expect(alerts[0]).toMatchObject({ live: true });
  });
});
