import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser, resetDatabase } from "@/test/fixtures";

const { markChatRead, sendMessage, startDirectChat, updateChat } = await import("./chat");
const { DELETED_USER_NAME, getMessages, listChats, searchPeople } = await import("@/server/queries/chat");
const { MAX_MESSAGE_LENGTH, MESSAGES_PAGE_SIZE, sendMessageSchema } = await import("@/server/validation/chat");
const { prisma } = await import("@/server/db");

type User = Awaited<ReturnType<typeof createUser>>;
let ana: User;
let besa: User;
let admin: User;

beforeEach(async () => {
  await resetDatabase();
  ana = await createUser("student");
  besa = await createUser("student");
  admin = await createUser("admin");
});

/** Distinct, increasing times so ordering is deterministic. */
let tick = Date.now();
const at = () => new Date((tick += 1_000));

const say = (from: User, chatId: string, text: string) => sendMessage(from, chatId, sendMessageSchema.parse({ body: text }), at());
const page = (user: User, chatId: string, before: string | null = null) => getMessages(user, chatId, { before, limit: MESSAGES_PAGE_SIZE });

describe("starting a chat", () => {
  it("refuses a chat with yourself, unknown people and deactivated accounts", async () => {
    const gone = await createUser("student", { banned: true });
    await expect(startDirectChat(ana, { userId: ana.id })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(startDirectChat(ana, { userId: "nobody" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(startDirectChat(ana, { userId: gone.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("gives a pair one chat, whoever starts it and even when both start at once", async () => {
    const first = await startDirectChat(ana, { userId: besa.id });
    expect(await startDirectChat(besa, { userId: ana.id })).toEqual(first);

    const [a, b] = await Promise.all([startDirectChat(ana, { userId: admin.id }), startDirectChat(admin, { userId: ana.id })]);
    expect(a).toEqual(b);
    expect(await prisma.conversation.count()).toBe(2);
    expect(await prisma.conversationMember.count()).toBe(4);
  });

  it("works between any two people, students and admins alike", async () => {
    await expect(startDirectChat(besa, { userId: admin.id })).resolves.toHaveProperty("id");
    await expect(startDirectChat(admin, { userId: ana.id })).resolves.toHaveProperty("id");
  });
});

describe("messages", () => {
  it("only members can read or send", async () => {
    const { id } = await startDirectChat(ana, { userId: besa.id });
    await expect(say(admin, id, "hej")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(page(admin, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(markChatRead(admin, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateChat(admin, id, { pinned: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects empty and too long messages before they reach the service", () => {
    expect(() => sendMessageSchema.parse({ body: "   " })).toThrow();
    expect(() => sendMessageSchema.parse({ body: "x".repeat(MAX_MESSAGE_LENGTH + 1) })).toThrow();
    expect(sendMessageSchema.parse({ body: "  rresht 1\nrresht 2  " }).body).toBe("rresht 1\nrresht 2");
  });

  it("limits how many messages one person sends per minute", async () => {
    const { id } = await startDirectChat(ana, { userId: besa.id });
    const now = new Date();
    await prisma.message.createMany({ data: Array.from({ length: 30 }, () => ({ conversationId: id, senderId: ana.id, body: "x", createdAt: now })) });
    await expect(sendMessage(ana, id, { body: "edhe një" }, now)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(sendMessage(besa, id, { body: "unë po" }, now)).resolves.toHaveProperty("id");
  });

  it("pages back through history, oldest first on each page", async () => {
    const { id } = await startDirectChat(ana, { userId: besa.id });
    // Written directly (one second apart): sending 55 through the service would hit the rate limit.
    await prisma.message.createMany({
      data: Array.from({ length: MESSAGES_PAGE_SIZE + 5 }, (_, i) => ({ conversationId: id, senderId: ana.id, body: `m${i + 1}`, createdAt: at() })),
    });

    const newest = await page(besa, id);
    expect(newest.messages).toHaveLength(MESSAGES_PAGE_SIZE);
    expect(newest.messages.at(-1)?.body).toBe(`m${MESSAGES_PAGE_SIZE + 5}`);
    expect(newest.hasMore).toBe(true);

    const older = await page(besa, id, newest.messages[0].id);
    expect(older.messages.map((m) => m.body)).toEqual(["m1", "m2", "m3", "m4", "m5"]);
    expect(older.hasMore).toBe(false);
  });
});

describe("unread counts and read receipts", () => {
  it("counts the other person's new messages until the chat is read", async () => {
    const { id } = await startDirectChat(ana, { userId: besa.id });
    await say(ana, id, "Përshëndetje!");
    await say(ana, id, "A je aty?");

    expect((await listChats(ana)).unreadTotal).toBe(0); // my own messages are never unread
    const before = await listChats(besa);
    expect(before.unreadTotal).toBe(2);
    expect(before.chats[0]).toMatchObject({ title: ana.name, unread: 2, lastMessage: { body: "A je aty?", mine: false } });

    // Before Besa reads, Ana's messages aren't "seen".
    const lastSent = (await page(ana, id)).messages.at(-1)!;
    expect((await page(ana, id)).readBy[0].lastReadAt).toBeNull();

    await markChatRead(besa, id, at());
    expect((await listChats(besa)).unreadTotal).toBe(0);
    const readAt = (await page(ana, id)).readBy[0].lastReadAt!;
    expect(readAt.getTime()).toBeGreaterThanOrEqual(lastSent.createdAt.getTime());
  });
});

describe("chat list", () => {
  it("puts pinned chats first, then the newest", async () => {
    const withBesa = await startDirectChat(ana, { userId: besa.id });
    const withAdmin = await startDirectChat(ana, { userId: admin.id });
    await say(besa, withBesa.id, "e para");
    await say(admin, withAdmin.id, "e dyta");
    expect((await listChats(ana)).chats.map((c) => c.id)).toEqual([withAdmin.id, withBesa.id]);

    await updateChat(ana, withBesa.id, { pinned: true }, at());
    const pinned = await listChats(ana);
    expect(pinned.chats.map((c) => c.id)).toEqual([withBesa.id, withAdmin.id]);
    expect(pinned.chats[0].pinned).toBe(true);
    // A pin is only mine.
    expect((await listChats(besa)).chats[0].pinned).toBe(false);
  });

  it("shows an empty chat only to the person who started it", async () => {
    await startDirectChat(ana, { userId: besa.id });
    expect((await listChats(ana)).chats).toHaveLength(1);
    expect((await listChats(besa)).chats).toHaveLength(0);
  });

  it("deleting a chat for me hides it and its history from me only, until a new message", async () => {
    const { id } = await startDirectChat(ana, { userId: besa.id });
    await say(ana, id, "e vjetër");
    await updateChat(besa, id, { pinned: true }, at());
    await updateChat(besa, id, { hidden: true }, at());

    expect((await listChats(besa)).chats).toHaveLength(0);
    expect((await listChats(ana)).chats).toHaveLength(1); // Ana keeps it

    await say(ana, id, "e re");
    const back = await listChats(besa);
    expect(back.chats).toHaveLength(1);
    expect(back.chats[0]).toMatchObject({ pinned: false, unread: 1 }); // the old message stays gone
    expect((await page(besa, id)).messages.map((m) => m.body)).toEqual(["e re"]);
    expect((await page(ana, id)).messages.map((m) => m.body)).toEqual(["e vjetër", "e re"]);
  });

  it("reopening a chat I deleted brings it back without its old history", async () => {
    const { id } = await startDirectChat(ana, { userId: besa.id });
    await say(besa, id, "e vjetër");
    await updateChat(ana, id, { hidden: true }, at());
    expect(await startDirectChat(ana, { userId: besa.id })).toEqual({ id });
    await say(ana, id, "prapë këtu");
    expect((await page(ana, id)).messages.map((m) => m.body)).toEqual(["prapë këtu"]);
  });

  it("keeps the other person's history when an account is deleted", async () => {
    const { id } = await startDirectChat(ana, { userId: besa.id });
    await say(besa, id, "mirupafshim");
    await prisma.user.delete({ where: { id: besa.id } });

    const [chat] = (await listChats(ana)).chats;
    expect(chat).toMatchObject({ title: DELETED_USER_NAME, otherUser: null });
    expect((await page(ana, id)).messages[0]).toMatchObject({ body: "mirupafshim", senderId: null, mine: false });
  });
});

describe("people search", () => {
  it("lists every active account except me, searchable by name", async () => {
    const gone = await createUser("student", { banned: true });
    const everyone = (await searchPeople(ana, { q: "" })).map((p) => p.id);
    expect(everyone).toEqual(expect.arrayContaining([besa.id, admin.id]));
    expect(everyone).not.toContain(ana.id);
    expect(everyone).not.toContain(gone.id);

    const admins = await searchPeople(ana, { q: "ADMIN" });
    expect(admins.map((p) => p.id)).toEqual([admin.id]);
  });
});
