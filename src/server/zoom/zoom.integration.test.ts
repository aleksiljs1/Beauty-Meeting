import "dotenv/config";
import { createHmac } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createLesson, createUser, resetDatabase } from "@/test/fixtures";

// Live Zoom mode with fake credentials. vi.hoisted runs before every import (and dotenv
// never overrides variables that are already set), so the server modules see live mode.
vi.hoisted(() => {
  Object.assign(process.env, {
    ZOOM_MODE: "live",
    ZOOM_CLIENT_ID: "sdk-client-id",
    ZOOM_CLIENT_SECRET: "sdk-client-secret",
    ZOOM_S2S_ACCOUNT_ID: "academy-account",
    ZOOM_S2S_CLIENT_ID: "s2s-client-id",
    ZOOM_S2S_CLIENT_SECRET: "s2s-client-secret",
    ZOOM_HOST_USER_ID: "host@academy.test",
    ZOOM_WEBHOOK_SECRET_TOKEN: "webhook-secret",
    APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64url"),
  });
});

// --- Fake Zoom API ------------------------------------------------------------------------
type FakeMeeting = { id: number; password: string; agenda: string; start_time: string; status: "waiting" | "started"; join_url?: string };
const zoomState = { meetings: new Map<string, FakeMeeting>(), calls: [] as string[], nextId: 81_234_567_890, timeoutNextCreate: false, startUrls: 0 };
const fakeJoinUrl = (id: number | string) => `https://us05web.zoom.us/j/${id}?pwd=ZoomEncryptedPwd.1`;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

vi.stubGlobal("fetch", async (input: string | URL, init: RequestInit = {}) => {
  const url = new URL(String(input));
  const method = init.method ?? "GET";
  zoomState.calls.push(`${method} ${url.pathname}`);
  if (url.hostname === "zoom.us") return json({ access_token: "s2s-token", expires_in: 3600 });

  const meetingPath = url.pathname.match(/^\/v2\/meetings\/(\d+)$/);
  if (url.pathname.endsWith("/zak")) return json({ token: "zak-token" });
  if (url.pathname.endsWith("/meetings") && method === "GET") {
    return json({ meetings: [...zoomState.meetings.values()].map(({ id, start_time }) => ({ id, start_time })) });
  }
  if (url.pathname.endsWith("/meetings") && method === "POST") {
    const body = JSON.parse(String(init.body));
    const id = zoomState.nextId++;
    const meeting: FakeMeeting = { id, password: "483920", agenda: body.agenda, start_time: body.start_time.replace(".000", ""), status: "waiting", join_url: fakeJoinUrl(id) };
    zoomState.meetings.set(String(meeting.id), meeting);
    if (zoomState.timeoutNextCreate) {
      zoomState.timeoutNextCreate = false;
      throw new DOMException("The operation timed out.", "TimeoutError"); // created, but the response never arrives
    }
    return json(meeting, 201);
  }
  if (meetingPath) {
    const meeting = zoomState.meetings.get(meetingPath[1]);
    if (method === "DELETE") return new Response(null, { status: meeting && zoomState.meetings.delete(meetingPath[1]) ? 204 : 404 });
    if (!meeting) return json({ code: 3001 }, 404);
    if (method === "PATCH") return new Response(null, { status: 204 });
    // Like Zoom: every GET returns a freshly signed start_url.
    return json({ ...meeting, start_url: `https://us05web.zoom.us/s/${meeting.id}?zak=fresh-${++zoomState.startUrls}` });
  }
  return json({ message: "unexpected call" }, 500);
});

const { prisma } = await import("@/server/db");
const { createZoomMeetingForLesson } = await import("./meetings");
const { createZoomHostAppStart, createZoomHostAuthorization } = await import("./host");
const { authorizeLessonJoin, authorizeZoomAppJoin } = await import("./join");
const { handleZoomWebhook } = await import("./webhooks");
const { setLessonPublication, updateLesson } = await import("@/server/services/lessons");
const { resetZoomTokenCache } = await import("./client");

afterAll(() => vi.unstubAllGlobals());

let admin: Awaited<ReturnType<typeof createUser>>;
let student: Awaited<ReturnType<typeof createUser>>;
let lessonId: string;

beforeEach(async () => {
  await resetDatabase();
  await prisma.webhookEvent.deleteMany();
  zoomState.meetings.clear();
  zoomState.calls = [];
  zoomState.startUrls = 0;
  resetZoomTokenCache();
  admin = await createUser("admin");
  student = await createUser("student");
  // Starts in 10 minutes: inside the host's 30-minute window and the students' join window.
  const start = new Date(Date.now() + 10 * 60_000);
  const lesson = await createLesson(admin.id, {
    scheduledStartAt: start,
    scheduledEndAt: new Date(start.getTime() + 3 * 3_600_000),
    joinOpensAt: new Date(Date.now() - 60_000),
    meetingStatus: "NOT_PROVISIONED",
  });
  lessonId = lesson.id;
  await prisma.lessonEnrollment.create({ data: { lessonId, userId: student.id, source: "ADMIN" } });
});

function webhook(body: object, { secret = "webhook-secret", ts = Math.floor(Date.now() / 1000) } = {}) {
  const raw = JSON.stringify(body);
  const signature = `v0=${createHmac("sha256", secret).update(`v0:${ts}:${raw}`).digest("hex")}`;
  return handleZoomWebhook(raw, new Headers({ "x-zm-signature": signature, "x-zm-request-timestamp": String(ts) }));
}
const meetingEvent = (event: string, meetingNumber: string, eventTs: number, time: Date) => ({
  event,
  event_ts: eventTs,
  payload: { account_id: "academy-account", object: { id: meetingNumber, [event === "meeting.started" ? "start_time" : "end_time"]: time.toISOString() } },
});
const lessonState = () => prisma.lesson.findUniqueOrThrow({ where: { id: lessonId }, select: { meetingStatus: true, zoomMeetingNumber: true, zoomPasscodeEncrypted: true } });

describe("meeting creation", () => {
  it("creates one meeting and stores the passcode encrypted", async () => {
    const result = await createZoomMeetingForLesson(lessonId, admin);
    const state = await lessonState();
    expect(state).toMatchObject({ meetingStatus: "SCHEDULED", zoomMeetingNumber: result.meetingNumber });
    expect(state.zoomPasscodeEncrypted).toBeTruthy();
    expect(state.zoomPasscodeEncrypted).not.toContain("483920");
    expect(JSON.stringify(result)).not.toContain("483920");
  });

  it("never creates two meetings for one lesson, even on a double click", async () => {
    const results = await Promise.allSettled([createZoomMeetingForLesson(lessonId, admin), createZoomMeetingForLesson(lessonId, admin)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(zoomState.meetings.size).toBe(1);
  });

  it("recovers the meeting Zoom created when the response timed out, instead of creating a second", async () => {
    zoomState.timeoutNextCreate = true;
    const result = await createZoomMeetingForLesson(lessonId, admin);
    expect(zoomState.meetings.size).toBe(1);
    expect(zoomState.calls.filter((c) => c.startsWith("POST /v2/users"))).toHaveLength(1);
    expect((await lessonState()).zoomMeetingNumber).toBe(result.meetingNumber);
  });

  it("caches the OAuth token across requests", async () => {
    await createZoomMeetingForLesson(lessonId, admin);
    await createZoomHostAuthorization(lessonId, admin);
    expect(zoomState.calls.filter((c) => c === "POST /oauth/token")).toHaveLength(1);
  });

  it("refuses demo lessons", async () => {
    await prisma.lesson.update({ where: { id: lessonId }, data: { isDemo: true } });
    await expect(createZoomMeetingForLesson(lessonId, admin)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(zoomState.meetings.size).toBe(0);
  });
});

describe("joining", () => {
  it("gives an enrolled student a participant authorization with the decrypted passcode", async () => {
    const { meetingNumber } = await createZoomMeetingForLesson(lessonId, admin);
    const join = await authorizeLessonJoin(student, lessonId);
    expect(join).toMatchObject({ mode: "student", lessonId, meetingNumber, password: "483920", userName: student.name });
    expect(join).not.toHaveProperty("zak");
    const payload = JSON.parse(Buffer.from((join as { signature: string }).signature.split(".")[1], "base64url").toString());
    expect(payload).toMatchObject({ role: 0, mn: meetingNumber });
  });

  it("refuses students who aren't enrolled", async () => {
    await createZoomMeetingForLesson(lessonId, admin);
    await expect(authorizeLessonJoin(await createUser("student"), lessonId)).rejects.toMatchObject({ code: "LESSON_NOT_AVAILABLE" });
  });

  it("gives the host a role-1 signature and ZAK, never to students", async () => {
    await createZoomMeetingForLesson(lessonId, admin);
    const host = await createZoomHostAuthorization(lessonId, admin);
    expect(host).toMatchObject({ mode: "host", zak: "zak-token", password: "483920" });
    await expect(createZoomHostAuthorization(lessonId, student)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("Zoom app fallbacks", () => {
  const joinUrlState = () => prisma.lesson.findUniqueOrThrow({ where: { id: lessonId }, select: { zoomJoinUrlEncrypted: true } });

  it("stores Zoom's join_url encrypted at creation and hands it to an enrolled student", async () => {
    const { meetingNumber } = await createZoomMeetingForLesson(lessonId, admin);
    const { zoomJoinUrlEncrypted } = await joinUrlState();
    expect(zoomJoinUrlEncrypted).toBeTruthy();
    expect(zoomJoinUrlEncrypted).not.toContain(meetingNumber);

    zoomState.calls = [];
    expect(await authorizeZoomAppJoin(student, lessonId)).toEqual({ joinUrl: fakeJoinUrl(meetingNumber) });
    expect(zoomState.calls).toEqual([]); // served from our encrypted copy
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "lesson.zoom_app_join", actorId: student.id } });
    expect(JSON.stringify(log.details)).not.toContain("pwd");
  });

  it("fetches and stores the link from Zoom once when it is missing (older meetings)", async () => {
    const { meetingNumber } = await createZoomMeetingForLesson(lessonId, admin);
    await prisma.lesson.update({ where: { id: lessonId }, data: { zoomJoinUrlEncrypted: null } });
    zoomState.calls = [];
    expect((await authorizeZoomAppJoin(student, lessonId)).joinUrl).toBe(fakeJoinUrl(meetingNumber));
    expect((await authorizeZoomAppJoin(student, lessonId)).joinUrl).toBe(fakeJoinUrl(meetingNumber));
    expect(zoomState.calls.filter((c) => c === `GET /v2/meetings/${meetingNumber}`)).toHaveLength(1);
    expect((await joinUrlState()).zoomJoinUrlEncrypted).toBeTruthy();
  });

  it("applies the same access policy as the embedded join", async () => {
    await createZoomMeetingForLesson(lessonId, admin);
    await expect(authorizeZoomAppJoin(await createUser("student"), lessonId)).rejects.toMatchObject({ code: "LESSON_NOT_AVAILABLE" });
    await prisma.lessonEnrollment.updateMany({ where: { lessonId, userId: student.id }, data: { accessExpiresAt: new Date(Date.now() - 1000) } });
    await expect(authorizeZoomAppJoin(student, lessonId)).rejects.toMatchObject({ code: "LESSON_ACCESS_EXPIRED" });
  });

  it("refuses demo lessons and lessons without a meeting", async () => {
    await prisma.lesson.update({ where: { id: lessonId }, data: { meetingStatus: "SCHEDULED" } });
    await expect(authorizeZoomAppJoin(student, lessonId)).rejects.toMatchObject({ code: "INTEGRATION_NOT_CONFIGURED" });
    await prisma.lesson.update({ where: { id: lessonId }, data: { isDemo: true } });
    await expect(authorizeZoomAppJoin(student, lessonId)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(zoomState.calls.some((c) => c.startsWith("GET /v2/meetings/"))).toBe(false);
  });

  it("gives the admin a fresh start_url for the desktop app, never stored, never to students", async () => {
    await createZoomMeetingForLesson(lessonId, admin);
    const first = await createZoomHostAppStart(lessonId, admin);
    const second = await createZoomHostAppStart(lessonId, admin);
    expect(first.startUrl).toMatch(/^https:\/\/us05web\.zoom\.us\/s\/\d+\?zak=fresh-\d+$/);
    expect(second.startUrl).not.toBe(first.startUrl);

    const row = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } });
    expect(JSON.stringify(row)).not.toContain("zak=");
    const logs = await prisma.auditLog.findMany({ where: { action: "lesson.zoom_host_app_start" } });
    expect(logs).toHaveLength(2);
    expect(JSON.stringify(logs.map((l) => l.details))).not.toContain("zak");

    await expect(createZoomHostAppStart(lessonId, student)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("uses the same time window as the in-browser host start", async () => {
    await createZoomMeetingForLesson(lessonId, admin);
    const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId }, select: { scheduledStartAt: true, scheduledEndAt: true } });
    await expect(createZoomHostAppStart(lessonId, admin, lesson.scheduledStartAt.getTime() - 31 * 60_000)).rejects.toMatchObject({ code: "LESSON_JOIN_NOT_OPEN" });
    await expect(createZoomHostAppStart(lessonId, admin, lesson.scheduledEndAt.getTime())).rejects.toMatchObject({ code: "CONFLICT" });
    expect(zoomState.calls.some((c) => c.startsWith("GET /v2/meetings/"))).toBe(false);
  });
});

describe("webhooks", () => {
  async function liveLesson() {
    const { meetingNumber } = await createZoomMeetingForLesson(lessonId, admin);
    return meetingNumber;
  }

  it("answers Zoom's URL validation challenge", async () => {
    const res = await webhook({ event: "endpoint.url_validation", event_ts: Date.now(), payload: { plainToken: "abc" } });
    expect(res).toEqual({ status: 200, body: { plainToken: "abc", encryptedToken: createHmac("sha256", "webhook-secret").update("abc").digest("hex") } });
  });

  it("rejects forged or replayed requests", async () => {
    const meetingNumber = await liveLesson();
    const event = meetingEvent("meeting.started", meetingNumber, Date.now(), new Date());
    expect((await webhook(event, { secret: "wrong" })).status).toBe(401);
    expect((await webhook(event, { ts: Math.floor(Date.now() / 1000) - 3600 })).status).toBe(401);
    expect((await lessonState()).meetingStatus).toBe("SCHEDULED");
  });

  it("started → LIVE (students alerted once even if Zoom delivers twice); ended → ENDED", async () => {
    const meetingNumber = await liveLesson();
    const startedAt = new Date();
    const started = meetingEvent("meeting.started", meetingNumber, Date.now(), startedAt);
    expect((await webhook(started)).status).toBe(200);
    expect((await webhook(started)).body).toMatchObject({ duplicate: true });
    expect((await lessonState()).meetingStatus).toBe("LIVE");
    expect(await prisma.notification.count({ where: { userId: student.id, type: "LESSON_LIVE" } })).toBe(1);

    await webhook(meetingEvent("meeting.ended", meetingNumber, Date.now() + 1, new Date(startedAt.getTime() + 60_000)));
    expect((await lessonState()).meetingStatus).toBe("ENDED");
  });

  it("ignores stale, out-of-order events but accepts a genuine restart", async () => {
    const meetingNumber = await liveLesson();
    const t0 = Date.now();
    await webhook(meetingEvent("meeting.started", meetingNumber, t0, new Date(t0)));
    // An "ended" from before this session started must not end it.
    await webhook(meetingEvent("meeting.ended", meetingNumber, t0 + 1, new Date(t0 - 3_600_000)));
    expect((await lessonState()).meetingStatus).toBe("LIVE");

    await webhook(meetingEvent("meeting.ended", meetingNumber, t0 + 2, new Date(t0 + 60_000)));
    // A delayed copy of the original "started" can't reopen it…
    await webhook(meetingEvent("meeting.started", meetingNumber, t0 + 3, new Date(t0)));
    expect((await lessonState()).meetingStatus).toBe("ENDED");
    // …but the teacher restarting the meeting later does.
    await webhook(meetingEvent("meeting.started", meetingNumber, t0 + 4, new Date(t0 + 120_000)));
    expect((await lessonState()).meetingStatus).toBe("LIVE");
  });

  it("ignores other Zoom accounts and unknown meetings", async () => {
    const meetingNumber = await liveLesson();
    const foreign = meetingEvent("meeting.started", meetingNumber, Date.now(), new Date());
    foreign.payload.account_id = "someone-else";
    await webhook(foreign);
    await webhook(meetingEvent("meeting.started", "99999999999", Date.now(), new Date()));
    expect((await lessonState()).meetingStatus).toBe("SCHEDULED");
  });
});

describe("keeping Zoom in sync with the lesson", () => {
  it("updates the Zoom meeting when the lesson is rescheduled", async () => {
    await createZoomMeetingForLesson(lessonId, admin);
    const newStart = new Date(Date.now() + 2 * 86_400_000);
    const result = await updateLesson(
      lessonId,
      { scheduledStartAt: newStart, scheduledEndAt: new Date(newStart.getTime() + 3_600_000), joinOpensAt: newStart, accessExpiresAt: new Date(newStart.getTime() + 30 * 86_400_000) },
      false,
      admin,
    );
    expect(result).toEqual({ zoomSynced: true });
    expect(zoomState.calls.some((c) => c.startsWith("PATCH /v2/meetings/"))).toBe(true);
  });

  it("deletes the Zoom meeting when the lesson is cancelled", async () => {
    await createZoomMeetingForLesson(lessonId, admin);
    expect(await setLessonPublication(lessonId, "CANCELLED", admin)).toEqual({ zoomDeleted: true });
    expect(zoomState.meetings.size).toBe(0);
    expect(await lessonState()).toMatchObject({ zoomMeetingNumber: null, zoomPasscodeEncrypted: null, meetingStatus: "NOT_PROVISIONED" });
    expect((await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } })).zoomJoinUrlEncrypted).toBeNull();
  });
});
