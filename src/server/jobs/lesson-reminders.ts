import "server-only";
import { sendDueLessonReminders } from "@/server/services/admin-reminders";

const EVERY_MS = 60_000;

/**
 * Checks once a minute for admin lesson reminders that are due. Started once per server process
 * (instrumentation.ts); a run that is still going is never overlapped by the next one.
 */
export function startLessonReminders() {
  const state = globalThis as typeof globalThis & { lessonRemindersStarted?: boolean };
  if (state.lessonRemindersStarted) return;
  state.lessonRemindersStarted = true;

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const sent = await sendDueLessonReminders();
      if (sent) console.info(`[reminders] sent ${sent}`);
    } catch (error) {
      console.error("[reminders] run failed", error);
    } finally {
      running = false;
    }
  };
  setInterval(tick, EVERY_MS).unref();
  void tick();
}
