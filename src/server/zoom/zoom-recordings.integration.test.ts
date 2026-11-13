import "dotenv/config";
import { createHmac } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createLesson, createUser, resetDatabase } from "@/test/fixtures";

// Live Zoom mode with fake credentials, before any server module reads the environment.
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
    ZOOM_AUTO_RECORDING: "cloud",
    APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64url"),
  });
});

// --- Fake Zoom: OAuth, the recordings list, and file downloads (storage stays the real local one) ---
/** A small "MP4": the ftyp box the import checks for, then filler. */
const VIDEO = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(200_000, 1)]);
const zoom = { failDownloads: 0, downloads: 0, linkLookups: 0, listed: [] as unknown[] };

vi.stubGlobal("fetch", async (input: string | URL) => {
  const url = new URL(String(input));
  if (url.hostname === "zoom.us" && url.pathname === "/oauth/token") return Response.json({ access_token: "s2s-token", expires_in: 3600 });
  if (url.pathname.startsWith("/rec/download/")) {
    zoom.downloads++;
    if (zoom.failDownloads > 0) {
      zoom.failDownloads--;
      return new Response("busy", { status: 503 });
    }
    return new Response(VIDEO, { status: 200, headers: { "content-type": "video/mp4" } });
  }
  if (url.pathname.endsWith("/recordings") && url.pathname.startsWith("/v2/users/")) return Response.json({ meetings: zoom.listed });
  // A meeting's files with their current links (the event's own links need the event's token).
  if (url.pathname.endsWith("/recordings") && url.pathname.startsWith("/v2/meetings/")) {
    zoom.linkLookups++;
    return Response.json({
      recording_files: ["f-screen", "f-gallery", "f-late"].map((id) => ({ id, download_url: `https://us06web.zoom.us/rec/download/${id}` })),
    });
  }
  return Response.json({ message: "unexpected call" }, { status: 500 });
});

const { prisma } = await import("@/server/db");
const { handleZoomWebhook } = await import("./webhooks");
const { importNextZoomRecording, catchUpMissedRecordings } = await import("./recording-import");
const { getLessonAttendance } = await import("@/server/services/attendance");
const { markLessonEnded } = await import("@/server/services/live");

afterAll(() => vi.unstubAllGlobals());

const MEETING = "81234567890";
let lessonId: string;
let klea: Awaited<ReturnType<typeof createUser>>;
let arta: Awaited<ReturnType<typeof createUser>>;
let absent: Awaited<ReturnType<typeof createUser>>;

beforeEach(async () => {
  await resetDatabase();
  await prisma.webhookEvent.deleteMany();
  Object.assign(zoom, { failDownloads: 0, downloads: 0, linkLookups: 0, listed: [] });
  const admin = await createUser("admin");
  [klea, arta, absent] = [await createUser("student"), await createUser("student"), await createUser("student")];
  await prisma.user.update({ where: { id: arta.id }, data: { name: "Arta Krasniqi" } });
  const lesson = await createLesson(admin.id, { zoomMeetingNumber: MEETING, meetingStatus: "LIVE", liveStartedAt: new Date(Date.now() - 60 * 60_000) });
  lessonId = lesson.id;
  await prisma.lessonEnrollment.createMany({ data: [klea, arta, absent].map((s) => ({ lessonId, userId: s.id, source: "ADMIN" as const })) });
});

function webhook(body: object) {
  const raw = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000);
  const signature = `v0=${createHmac("sha256", "webhook-secret").update(`v0:${ts}:${raw}`).digest("hex")}`;
  return handleZoomWebhook(raw, new Headers({ "x-zm-signature": signature, "x-zm-request-timestamp": String(ts) }));
}

let eventTs = Date.now();
const participantEvent = (event: "joined" | "left", participant: Record<string, string>) => ({
  event: `meeting.participant_${event}`,
  event_ts: eventTs++,
  payload: { account_id: "academy-account", object: { id: MEETING, uuid: "abc==", host_id: "host-zoom-id", participant } },
});
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

describe("attendance from Zoom's participant events", () => {
  it("records who came and for how long, matched by our key or the name, without the teacher", async () => {
    // Klea joins from our site (customer key), leaves and comes back.
    await webhook(participantEvent("joined", { participant_uuid: "p-klea", user_name: "Klea", customer_key: klea.id, join_time: minutesAgo(50) }));
    await webhook(participantEvent("left", { participant_uuid: "p-klea", user_name: "Klea", customer_key: klea.id, leave_time: minutesAgo(30) }));
    await webhook(participantEvent("joined", { participant_uuid: "p-klea", user_name: "Klea", customer_key: klea.id, join_time: minutesAgo(20) }));
    // Arta joins with the Zoom app: matched by her name.
    await webhook(participantEvent("joined", { participant_uuid: "p-arta", user_name: "arta krasniqi", join_time: minutesAgo(40) }));
    // The teacher and a stranger.
    await webhook(participantEvent("joined", { id: "host-zoom-id", participant_uuid: "p-host", user_name: "Mësuesja", join_time: minutesAgo(55) }));
    await webhook(participantEvent("joined", { participant_uuid: "p-guest", user_name: "iPhone i Bores", join_time: minutesAgo(10) }));

    // The class ends: whoever is still in leaves then.
    await markLessonEnded(lessonId, "admin", null);

    const attendance = await getLessonAttendance(lessonId);
    expect(attendance.attended.map((r) => [r.userId, r.joins])).toEqual([
      [arta.id, 1],
      [klea.id, 2],
    ]);
    const kleaRow = attendance.attended.find((r) => r.userId === klea.id)!;
    expect(kleaRow.minutes).toBeGreaterThanOrEqual(39); // 20 + ~20 until the end
    expect(kleaRow.lastLeftAt).not.toBeNull();
    expect(attendance.absent).toEqual([{ userId: absent.id, name: absent.name }]);
    expect(attendance.others.map((r) => r.name)).toEqual(["iPhone i Bores"]);
  });

  it("ignores a repeated event", async () => {
    const event = participantEvent("joined", { participant_uuid: "p-klea", user_name: "Klea", customer_key: klea.id, join_time: minutesAgo(5) });
    await webhook(event);
    await webhook(event);
    expect(await prisma.lessonAttendance.count()).toBe(1);
  });
});

const recordingFile = (id: string, layout: string, start: string, end: string) => ({
  id,
  file_type: "MP4",
  recording_type: layout,
  recording_start: start,
  recording_end: end,
  file_size: VIDEO.length,
  status: "completed",
  download_url: `https://us06web.zoom.us/rec/webhook_download/${id}`, // only valid with the event token
});
const recordingCompleted = () => ({
  event: "recording.completed",
  event_ts: eventTs++,
  payload: {
    account_id: "academy-account",
    object: {
      id: MEETING,
      uuid: "abc==",
      recording_files: [
        recordingFile("f-screen", "shared_screen_with_speaker_view", minutesAgo(60), minutesAgo(0)),
        recordingFile("f-gallery", "gallery_view", minutesAgo(60), minutesAgo(0)),
        { id: "f-audio", file_type: "M4A", recording_type: "audio_only", status: "completed", download_url: "https://us06web.zoom.us/rec/download/f-audio" },
      ],
    },
  },
});

describe("Zoom cloud recordings into Regjistrimet", () => {
  it("queues the best video once, copies it into storage and tells the students", async () => {
    await webhook(recordingCompleted());
    await webhook({ ...recordingCompleted() }); // Zoom sends it again
    const queued = await prisma.recording.findMany({ where: { lessonId } });
    expect(queued.map((r) => [r.providerFileId, r.status, r.layout])).toEqual([["f-screen", "WAITING", "shared_screen_with_speaker_view"]]);

    expect(await importNextZoomRecording()).toBe(true);
    expect(zoom.linkLookups).toBe(1); // the event's own link is never used
    const ready = await prisma.recording.findUniqueOrThrow({ where: { id: queued[0].id } });
    expect(ready).toMatchObject({ status: "READY", sizeBytes: BigInt(VIDEO.length), providerDownloadUrl: null, mimeType: "video/mp4" });
    expect(ready.objectKey).toMatch(/^recordings\//);
    expect(await prisma.notification.count({ where: { lessonId, type: "RECORDING_READY" } })).toBe(3);
    expect(await importNextZoomRecording()).toBe(false); // nothing left
  });

  it("retries a failed download later and gives up after a few attempts", async () => {
    await webhook(recordingCompleted());
    zoom.failDownloads = 1;
    await importNextZoomRecording();
    const failed = await prisma.recording.findFirstOrThrow({ where: { lessonId } });
    expect(failed).toMatchObject({ status: "FAILED", importAttempts: 1 });
    expect(failed.errorMessage).toContain("do të provohet përsëri");

    // Too early for a retry; later it succeeds.
    expect(await importNextZoomRecording()).toBe(false);
    expect(await importNextZoomRecording(new Date(Date.now() + 15 * 60_000))).toBe(true);
    expect(await prisma.recording.findFirstOrThrow({ where: { lessonId } })).toMatchObject({ status: "READY" });
  });

  it("finds a recording whose event never arrived", async () => {
    await prisma.lesson.update({ where: { id: lessonId }, data: { meetingStatus: "ENDED", liveEndedAt: new Date() } });
    zoom.listed = [{ id: Number(MEETING), uuid: "abc==", recording_files: [recordingFile("f-late", "active_speaker", minutesAgo(60), minutesAgo(0))] }];
    expect(await catchUpMissedRecordings()).toBe(1);
    expect(await catchUpMissedRecordings()).toBe(0); // already queued
  });

  it("finds the recording of a class the site never heard start (offline for the whole class)", async () => {
    const start = new Date(Date.now() - 3 * 60 * 60_000);
    await prisma.lesson.update({
      where: { id: lessonId },
      data: { meetingStatus: "SCHEDULED", liveStartedAt: null, scheduledStartAt: start, scheduledEndAt: new Date(start.getTime() + 2 * 60 * 60_000) },
    });
    zoom.listed = [{ id: Number(MEETING), uuid: "abc==", recording_files: [recordingFile("f-late", "active_speaker", minutesAgo(180), minutesAgo(60))] }];
    expect(await catchUpMissedRecordings()).toBe(1);
  });

  it("never brings back a recording the admin deleted", async () => {
    await webhook(recordingCompleted());
    expect(await importNextZoomRecording()).toBe(true);
    await prisma.recording.deleteMany({ where: { lessonId } });
    await prisma.lesson.update({ where: { id: lessonId }, data: { meetingStatus: "ENDED", liveEndedAt: new Date() } });
    zoom.listed = [{ id: Number(MEETING), uuid: "abc==", recording_files: [recordingFile("f-screen", "shared_screen_with_speaker_view", minutesAgo(60), minutesAgo(0))] }];
    expect(await catchUpMissedRecordings()).toBe(0);
  });

  it("keeps an imported recording ready even if telling the students fails", async () => {
    await webhook(recordingCompleted());
    const notify = vi.spyOn(prisma.notification, "createMany").mockRejectedValueOnce(new Error("database hiccup"));
    expect(await importNextZoomRecording()).toBe(true);
    notify.mockRestore();
    expect(await prisma.recording.findFirstOrThrow({ where: { lessonId } })).toMatchObject({ status: "READY", importAttempts: 1 });
  });
});

describe("a class whose 'ended' event never came", () => {
  it("stops counting attendance at the scheduled end and still finds the recording", async () => {
    const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60_000);
    await prisma.lesson.update({
      where: { id: lessonId },
      data: { scheduledStartAt: hoursAgo(5), scheduledEndAt: hoursAgo(3), liveStartedAt: hoursAgo(5) }, // still LIVE
    });
    await webhook(participantEvent("joined", { participant_uuid: "p-klea", user_name: "Klea", customer_key: klea.id, join_time: hoursAgo(4).toISOString() }));

    const [row] = (await getLessonAttendance(lessonId)).attended;
    expect(row.minutes).toBe(60);
    expect(row.lastLeftAt).not.toBeNull(); // not "still in the class"

    zoom.listed = [{ id: Number(MEETING), uuid: "abc==", recording_files: [recordingFile("f-late", "active_speaker", hoursAgo(5).toISOString(), hoursAgo(3).toISOString())] }];
    expect(await catchUpMissedRecordings()).toBe(1);
  });
});
