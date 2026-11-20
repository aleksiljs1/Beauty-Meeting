import "server-only";
import { deleteAbandonedUploads } from "@/server/services/upload-cleanup";
import { withJobLock } from "./job-lock";

const EVERY_MS = 60 * 60_000;

/**
 * Deletes material and recording uploads that were started but never finished, a day later
 * (services/upload-cleanup.ts), once an hour. Started once per server process (instrumentation.ts);
 * a run still going is never overlapped.
 */
export function startUploadCleanup() {
  const state = globalThis as typeof globalThis & { uploadCleanupStarted?: boolean };
  if (state.uploadCleanupStarted) return;
  state.uploadCleanupStarted = true;

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await withJobLock("upload-cleanup", async () => {
        // A batch per run; a longer backlog (only after long downtime) continues next hour.
        const deleted = await deleteAbandonedUploads();
        if (deleted) console.info(`[uploads] deleted ${deleted} abandoned upload(s)`);
      });
    } catch (error) {
      console.error("[uploads] cleanup run failed", (error as Error).message);
    } finally {
      running = false;
    }
  };
  setInterval(tick, EVERY_MS).unref();
  void tick();
}
