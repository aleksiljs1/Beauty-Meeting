import "server-only";
import { deleteExpiredRecordings } from "@/server/services/recordings";

const EVERY_MS = 60 * 60_000;

/**
 * Deletes the recordings of lessons whose access has expired (services/recordings.ts), once an
 * hour. Started once per server process (instrumentation.ts); a run still going is never overlapped.
 */
export function startRecordingCleanup() {
  const state = globalThis as typeof globalThis & { recordingCleanupStarted?: boolean };
  if (state.recordingCleanupStarted) return;
  state.recordingCleanupStarted = true;

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      // A batch per run; a longer backlog (only after long downtime) continues next hour.
      const deleted = await deleteExpiredRecordings();
      if (deleted) console.info(`[recordings] deleted ${deleted} recording(s) of expired lessons`);
    } catch (error) {
      console.error("[recordings] cleanup run failed", (error as Error).message);
    } finally {
      running = false;
    }
  };
  setInterval(tick, EVERY_MS).unref();
  void tick();
}
