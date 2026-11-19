import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser, resetDatabase } from "@/test/fixtures";

const { blockUser, sendMessage, startAttachment, startDirectChat, updateChat } = await import("./chat");
const { attachmentLink, deleteUnsentAttachments, removeUnsentAttachment, UNSENT_TTL_MS } = await import("./chat-attachments");
const { getMessages, listChats } = await import("@/server/queries/chat");
const { sendMessageSchema, startAttachmentSchema } = await import("@/server/validation/chat");
const { headObject } = await import("@/server/storage/storage");
const { prisma } = await import("@/server/db");

type User = Awaited<ReturnType<typeof createUser>>;
let ana: User;
let besa: User;
let cela: User;
let chatId: string;

beforeEach(async () => {
  await resetDatabase();
  ana = await createUser("student");
  besa = await createUser("student");
  cela = await createUser("student");
  chatId = (await startDirectChat(ana, { userId: besa.id })).id;
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(56).fill(7)]);
const PDF = new TextEncoder().encode(`%PDF-1.4\n${"x".repeat(100)}`);

let tick = Date.now();
const at = () => new Date((tick += 1_000));

/** Starts an upload as the browser would and (unless `upload: false`) PUTs the bytes to storage. */
async function attach(user: User, bytes: Uint8Array<ArrayBuffer>, filename: string, mimeType: string, options: { upload?: boolean; chat?: string; put?: Uint8Array<ArrayBuffer> } = {}) {
  const started = await startAttachment(user, options.chat ?? chatId, startAttachmentSchema.parse({ filename, mimeType, sizeBytes: bytes.byteLength, width: 8, height: 8 }));
  if (options.upload !== false) {
    const response = await fetch(started.uploadUrl, { method: "PUT", body: options.put ?? bytes, headers: started.headers });
    expect(response.ok).toBe(true);
  }
  return started.id;
}

const send = (user: User, input: { body?: string; attachmentIds?: string[] }, chat = chatId) => sendMessage(user, chat, sendMessageSchema.parse(input), at());

describe("chat photos and files", () => {
  it("sends a photo and a PDF with text; both members see them, with a working link to the photo", async () => {
    const photo = await attach(ana, PNG, "foto.png", "image/png");
    const pdf = await attach(ana, PDF, "Teknikat.pdf", "application/pdf");
    await send(ana, { body: "Shiko këto", attachmentIds: [photo, pdf] });

    const { messages } = await getMessages(besa, chatId, { before: null, limit: 50 });
    expect(messages).toHaveLength(1);
    const [first, second] = messages[0]!.attachments;
    expect(first).toMatchObject({ id: photo, name: "foto.png", mimeType: "image/png", size: PNG.byteLength, width: 8, height: 8 });
    expect(second).toMatchObject({ id: pdf, name: "Teknikat.pdf", url: null }); // files get a link when tapped
    const shown = await fetch(first!.url!);
    expect(shown.ok).toBe(true);
    expect(new Uint8Array(await shown.arrayBuffer()).slice(0, 8)).toEqual(PNG.slice(0, 8));

    const download = await fetch((await attachmentLink(besa, chatId, pdf, true)).url);
    expect(download.headers.get("content-disposition")).toMatch(/^attachment/);
  });

  it("sends photos without text; the chat list says what came", async () => {
    const one = await attach(ana, PNG, "a.png", "image/png");
    const two = await attach(ana, PNG, "b.png", "image/png");
    await send(ana, { attachmentIds: [one, two] });
    const { chats } = await listChats(besa);
    expect(chats[0]!.lastMessage).toMatchObject({ body: "", photos: 2, files: 0 });
    expect(() => sendMessageSchema.parse({ body: "  " })).toThrow(); // nothing at all is still refused
  });

  it("refuses a file that isn't what it claims, or that never finished uploading, and deletes it", async () => {
    const fake = await attach(ana, PNG, "foto.png", "image/png", { put: new Uint8Array(PNG.byteLength).fill(65) });
    await expect(send(ana, { attachmentIds: [fake] })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(await prisma.chatAttachment.count({ where: { id: fake } })).toBe(0);

    const never = await attach(ana, PDF, "x.pdf", "application/pdf", { upload: false });
    await expect(send(ana, { body: "hej", attachmentIds: [never] })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(await prisma.message.count()).toBe(0); // the text didn't go either
  });

  it("refuses types and sizes that aren't allowed, before anything is uploaded", async () => {
    const tryStart = (filename: string, mimeType: string, sizeBytes: number) => startAttachment(ana, chatId, startAttachmentSchema.parse({ filename, mimeType, sizeBytes }));
    await expect(tryStart("virus.exe", "application/octet-stream", 100)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(tryStart("anim.gif", "image/gif", 100)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(tryStart("big.png", "image/png", 11 * 1024 * 1024)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(tryStart("big.pdf", "application/pdf", 26 * 1024 * 1024)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(tryStart("ok.pdf", "application/pdf", 24 * 1024 * 1024)).resolves.toHaveProperty("uploadUrl");
  });

  it("keeps everything inside the chat: outsiders can't upload, send or open, nobody sends someone else's upload", async () => {
    await expect(attach(cela, PNG, "a.png", "image/png")).rejects.toMatchObject({ code: "NOT_FOUND" });

    const anas = await attach(ana, PNG, "a.png", "image/png");
    await expect(send(besa, { attachmentIds: [anas] })).rejects.toMatchObject({ code: "VALIDATION_FAILED" }); // not hers
    const other = (await startDirectChat(ana, { userId: cela.id })).id;
    await expect(send(ana, { attachmentIds: [anas] }, other)).rejects.toMatchObject({ code: "VALIDATION_FAILED" }); // another chat

    await send(ana, { attachmentIds: [anas] });
    await expect(attachmentLink(cela, chatId, anas, false)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(attachmentLink(besa, chatId, anas, false)).resolves.toHaveProperty("url");
  });

  it("sends an upload only once (double tap, two tabs)", async () => {
    const photo = await attach(ana, PNG, "a.png", "image/png");
    await send(ana, { attachmentIds: [photo] });
    await expect(send(ana, { attachmentIds: [photo] })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(await prisma.message.count()).toBe(1);
  });

  it("a block stops uploads too", async () => {
    await blockUser(besa, ana.id);
    await expect(attach(ana, PNG, "a.png", "image/png")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("deleting the chat for me hides its photos from me (not from the other person)", async () => {
    const photo = await attach(ana, PNG, "a.png", "image/png");
    await send(ana, { attachmentIds: [photo] });
    await updateChat(besa, chatId, { hidden: true }, at());
    await expect(attachmentLink(besa, chatId, photo, false)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(attachmentLink(ana, chatId, photo, false)).resolves.toHaveProperty("url");
  });

  it("removing a picked file deletes it; unsent uploads are cleaned up after a day, sent ones stay", async () => {
    const removed = await attach(ana, PNG, "a.png", "image/png");
    const key = (await prisma.chatAttachment.findUniqueOrThrow({ where: { id: removed } })).objectKey;
    await removeUnsentAttachment(ana, chatId, removed);
    expect(await prisma.chatAttachment.count({ where: { id: removed } })).toBe(0);
    expect(await headObject(key)).toBeNull();

    const sent = await attach(ana, PNG, "b.png", "image/png");
    await send(ana, { attachmentIds: [sent] });
    const forgotten = await attach(ana, PNG, "c.png", "image/png");
    expect(await deleteUnsentAttachments(new Date())).toBe(0); // not a day old yet
    expect(await deleteUnsentAttachments(new Date(Date.now() + UNSENT_TTL_MS + 60_000))).toBe(1);
    expect(await prisma.chatAttachment.findMany({ select: { id: true } })).toEqual([{ id: sent }]);
    expect(forgotten).not.toBe(sent);
  });
});
