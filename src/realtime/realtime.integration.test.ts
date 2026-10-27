import "dotenv/config";
import { io as connectClient, type Socket } from "socket.io-client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createLesson, createUser, resetDatabase } from "@/test/fixtures";
import { createRealtimeServer, REALTIME_PATH, type TokenClaims } from "./server";

const { publishFeedChanged } = await import("@/server/realtime/publish");
const { markLessonLive } = await import("@/server/services/live");
const { deleteMaterial } = await import("@/server/services/materials");
const { prisma } = await import("@/server/db");

const PORT = 3199;
const URL = `http://localhost:${PORT}`;
const tokens = new Map<string, TokenClaims>();
const future = () => Math.floor(Date.now() / 1000) + 300;

const server = createRealtimeServer({
  databaseUrl: process.env.DATABASE_URL!,
  corsOrigins: ["http://localhost:3000"],
  verifyToken: async (token) => tokens.get(token) ?? null,
  log: { info: () => undefined, warn: () => undefined, error: console.error },
  expirySweepMs: 200,
});

const sockets: Socket[] = [];
function connect(token: string) {
  const socket = connectClient(URL, { path: REALTIME_PATH, transports: ["websocket"], auth: { token }, reconnection: false, forceNew: true });
  sockets.push(socket);
  return socket;
}
const connected = (socket: Socket) =>
  new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
const nextEvent = (socket: Socket, event: string, timeoutMs = 2_000) =>
  new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    socket.once(event, () => {
      clearTimeout(timer);
      resolve(true);
    });
  });

beforeAll(async () => {
  await server.start(PORT, "127.0.0.1");
});

afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  await server.stop();
});

beforeEach(async () => {
  sockets.splice(0).forEach((s) => s.disconnect());
  tokens.clear();
  await resetDatabase();
});

describe("realtime service", () => {
  it("rejects connections without a valid token", async () => {
    await expect(connected(connect("forged"))).rejects.toMatchObject({ message: "unauthorized" });
  });

  it("signals only the users whose feed changed", async () => {
    tokens.set("ana", { userId: "user-ana", exp: future() });
    tokens.set("sara", { userId: "user-sara", exp: future() });
    const ana = connect("ana");
    const sara = connect("sara");
    await Promise.all([connected(ana), connected(sara)]);

    const anaGot = nextEvent(ana, "feed:changed");
    const saraGot = nextEvent(sara, "feed:changed", 600);
    await publishFeedChanged(["user-ana"]);
    expect(await anaGot).toBe(true);
    expect(await saraGot).toBe(false);
  });

  it("delivers the 'lesson is live' signal end to end", async () => {
    const admin = await createUser("admin");
    const student = await createUser("student");
    const lesson = await createLesson(admin.id, { isDemo: true, joinOpensAt: new Date(Date.now() - 60_000) });
    await prisma.lessonEnrollment.create({ data: { lessonId: lesson.id, userId: student.id, source: "ADMIN" } });

    tokens.set("student", { userId: student.id, exp: future() });
    const socket = connect("student");
    await connected(socket);

    const got = nextEvent(socket, "feed:changed");
    await markLessonLive(lesson.id, "demo", admin.id);
    expect(await got).toBe(true);
  });

  it("signals enrolled students when a lesson's materials change, so open pages update", async () => {
    const admin = await createUser("admin");
    const [student, stranger] = [await createUser("student"), await createUser("student")];
    const lesson = await createLesson(admin.id);
    await prisma.lessonEnrollment.create({ data: { lessonId: lesson.id, userId: student.id, source: "ADMIN" } });
    const material = await prisma.lessonMaterial.create({
      data: { lessonId: lesson.id, objectKey: `test/${lesson.id}/notes.pdf`, displayName: "notes.pdf", mimeType: "application/pdf", sizeBytes: BigInt(10), status: "READY", uploadedById: admin.id },
    });

    tokens.set("student", { userId: student.id, exp: future() });
    tokens.set("stranger", { userId: stranger.id, exp: future() });
    const [enrolledSocket, strangerSocket] = [connect("student"), connect("stranger")];
    await Promise.all([connected(enrolledSocket), connected(strangerSocket)]);

    const got = nextEvent(enrolledSocket, "feed:changed");
    const strangerGot = nextEvent(strangerSocket, "feed:changed", 600);
    await deleteMaterial(admin, material.id);
    expect(await got).toBe(true);
    expect(await strangerGot).toBe(false);
  });

  it("disconnects a socket that tries to re-authenticate as someone else", async () => {
    tokens.set("ana", { userId: "user-ana", exp: future() });
    tokens.set("sara", { userId: "user-sara", exp: future() });
    const ana = connect("ana");
    await connected(ana);
    const dropped = nextEvent(ana, "disconnect");
    ana.emit("reauth", "sara");
    expect(await dropped).toBe(true);
  });

  it("closes connections whose token expired, unless refreshed", async () => {
    tokens.set("short", { userId: "user-a", exp: Math.floor(Date.now() / 1000) + 1 });
    tokens.set("fresh", { userId: "user-a", exp: future() });
    tokens.set("short2", { userId: "user-b", exp: Math.floor(Date.now() / 1000) + 1 });

    const refreshed = connect("short");
    const stale = connect("short2");
    await Promise.all([connected(refreshed), connected(stale)]);
    await new Promise<boolean>((resolve) => refreshed.emit("reauth", "fresh", resolve));

    const staleDropped = nextEvent(stale, "disconnect", 3_000);
    expect(await staleDropped).toBe(true);
    expect(refreshed.connected).toBe(true);
  });

  it("reports health", async () => {
    const response = await fetch(`${URL}/health`);
    expect(response.status).toBe(200);
  });
});
