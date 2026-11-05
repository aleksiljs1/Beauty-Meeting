import "server-only";
import { env, zoomLive } from "@/server/env";
import { catchUpMissedRecordings, importNextZoomRecording } from "@/server/zoom/recording-import";

const EVERY_MS = 60_000;
const CATCH_UP_EVERY_MS = 60 * 60_000;
/** Recordings imported per run at most; a long queue continues on the next run. */
const PER_RUN = 5;

/**
 * Copies Zoom cloud recordings into Regjistrimet (recording-import.ts): queued files once a
 * minute, and once an hour asks Zoom for recordings whose event never arrived. Started once per
 * server process (instrumentation.ts); a run that is still going is never overlapped.
 */
export function startRecordingImports() {
  const state = globalThis as typeof globalThis & { recordingImportsStarted?: boolean };
  if (state.recordingImportsStarted || !zoomLive) return;
  state.recordingImportsStarted = true;

  let running = false;
  let lastCatchUp = 0;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      if (env.ZOOM_AUTO_RECORDING === "cloud" && Date.now() - lastCatchUp >= CATCH_UP_EVERY_MS) {
        lastCatchUp = Date.now();
        const queued = await catchUpMissedRecordings();
        if (queued) console.info(`[recordings] found ${queued} recording(s) whose Zoom event was missed`);
      }
      for (let i = 0; i < PER_RUN && (await importNextZoomRecording()); i++);
    } catch (error) {
      console.error("[recordings] import run failed", (error as Error).message);
    } finally {
      running = false;
    }
  };
  setInterval(tick, EVERY_MS).unref();
  void tick();
}
