import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { createLesson, createUser, resetDatabase } from "@/test/fixtures";

const { createInvitation, previewInvitation, redeemInvitation, revokeInvitation } = await import("./invitations");
const { prisma } = await import("@/server/db");

const DAY = 86_400_000;
const tokenOf = (url: string) => url.split("/ftese/")[1];

let admin: Awaited<ReturnType<typeof createUser>>;
let lesson: Awaited<ReturnType<typeof createLesson>>;

beforeEach(async () => {
  await resetDatabase();
  admin = await createUser("admin");
  lesson = await createLesson(admin.id);
});

async function newLink(options: { maxRedemptions?: number; accessExpiresAt?: Date; redeemUntil?: Date } = {}) {
  const { url } = await createInvitation(
    { lessonId: lesson.id, redeemUntil: options.redeemUntil ?? new Date(Date.now() + 7 * DAY), ...options },
    admin,
  );
  return tokenOf(url);
}

describe("shared lesson invitation", () => {
  it("stores only a hash of the token", async () => {
    const token = await newLink();
    const rows = await prisma.lessonInvitation.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toContain(token);
  });

  it("enrolls each student who redeems the same link", async () => {
    const token = await newLink();
    const [a, b] = [await createUser("student"), await createUser("student")];
    expect(await redeemInvitation(token, a)).toMatchObject({ state: "ENROLLED" });
    expect(await redeemInvitation(token, b)).toMatchObject({ state: "ENROLLED" });
    expect(await prisma.lessonEnrollment.count({ where: { lessonId: lesson.id } })).toBe(2);
  });

  it("does not consume anything when the link is only previewed", async () => {
    const token = await newLink({ maxRedemptions: 1 });
    const student = await createUser("student");
    expect(await previewInvitation(token, student)).toMatchObject({ state: "VALID" });
    expect(await previewInvitation(token, student)).toMatchObject({ state: "VALID" });
    expect(await prisma.lessonInvitation.findFirstOrThrow()).toMatchObject({ redemptionCount: 0 });
    expect(await prisma.lessonEnrollment.count()).toBe(0);
  });

  it("is idempotent for the same student and does not use up a second slot", async () => {
    const token = await newLink({ maxRedemptions: 5 });
    const student = await createUser("student");
    await redeemInvitation(token, student);
    expect(await redeemInvitation(token, student)).toMatchObject({ state: "ALREADY_ENROLLED" });
    expect(await prisma.lessonInvitation.findFirstOrThrow()).toMatchObject({ redemptionCount: 1 });
  });

  it("never exceeds the redemption limit under concurrent requests", async () => {
    const token = await newLink({ maxRedemptions: 3 });
    const students = await Promise.all(Array.from({ length: 6 }, () => createUser("student")));
    const results = await Promise.allSettled(students.map((s) => redeemInvitation(token, s)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(await prisma.lessonEnrollment.count()).toBe(3);
    expect(await prisma.lessonInvitation.findFirstOrThrow()).toMatchObject({ redemptionCount: 3 });
  });

  it("handles one student double-clicking (concurrent requests) without double-counting", async () => {
    const token = await newLink({ maxRedemptions: 10 });
    const student = await createUser("student");
    const results = await Promise.all([redeemInvitation(token, student), redeemInvitation(token, student), redeemInvitation(token, student)]);
    expect(results.map((r) => r.state).sort()).toContain("ENROLLED");
    expect(await prisma.lessonEnrollment.count()).toBe(1);
    expect(await prisma.lessonInvitation.findFirstOrThrow()).toMatchObject({ redemptionCount: 1 });
  });

  it("rejects expired and revoked links", async () => {
    const student = await createUser("student");
    const token = await newLink({ redeemUntil: new Date(Date.now() + 1000) });
    await expect(redeemInvitation(token, student, new Date(Date.now() + 2000))).rejects.toMatchObject({ code: "CONFLICT" });

    const other = await newLink();
    const invitation = await prisma.lessonInvitation.findFirstOrThrow({ where: { redemptionCount: 0, redeemUntil: { gt: new Date(Date.now() + DAY) } } });
    await revokeInvitation(invitation.id, admin);
    await expect(redeemInvitation(other, student)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("applies the link's shorter access deadline to new enrolments", async () => {
    const shorter = new Date(lesson.accessExpiresAt.getTime() - 10 * DAY);
    const token = await newLink({ accessExpiresAt: shorter });
    const student = await createUser("student");
    await redeemInvitation(token, student);
    expect(await prisma.lessonEnrollment.findFirstOrThrow()).toMatchObject({ accessExpiresAt: shorter });
  });

  it("does not re-admit a student whose access the teacher revoked", async () => {
    const token = await newLink();
    const student = await createUser("student");
    await redeemInvitation(token, student);
    await prisma.lessonEnrollment.updateMany({ data: { revokedAt: new Date() } });
    await expect(redeemInvitation(token, student)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not extend an existing enrolment", async () => {
    const own = new Date(lesson.accessExpiresAt.getTime() - 20 * DAY);
    const student = await createUser("student");
    await prisma.lessonEnrollment.create({ data: { lessonId: lesson.id, userId: student.id, source: "ADMIN", accessExpiresAt: own } });
    const token = await newLink();
    expect(await redeemInvitation(token, student)).toMatchObject({ state: "ALREADY_ENROLLED" });
    expect(await prisma.lessonEnrollment.findFirstOrThrow()).toMatchObject({ accessExpiresAt: own });
  });

  it("refuses links for draft or cancelled lessons, and admins", async () => {
    const token = await newLink();
    await expect(redeemInvitation(token, admin)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await prisma.lesson.update({ where: { id: lesson.id }, data: { publication: "CANCELLED" } });
    await expect(redeemInvitation(token, await createUser("student"))).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects links that outlive the lesson's access deadline", async () => {
    await expect(newLink({ redeemUntil: new Date(lesson.accessExpiresAt.getTime() + DAY) })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });
});
