import "server-only";
import { sendUnreadChatEmails } from "@/server/services/chat-emails";
import { withJobLock } from "./job-lock";

const EVERY_MS = 5 * 60_000;

/**
 * Every few minutes: one email to people with chat messages they haven't read (see
 * services/chat-emails.ts). Started once per server process (instrumentation.ts); a run that is
 * still going is never overlapped by the next one.
 */
export function startChatEmails() {
  const state = globalThis as typeof globalThis & { chatEmailsStarted?: boolean };
  if (state.chatEmailsStarted) return;
  state.chatEmailsStarted = true;

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await withJobLock("chat-emails", async () => {
        const sent = await sendUnreadChatEmails();
        if (sent) console.info(`[chat-emails] sent ${sent}`);
      });
    } catch (error) {
      console.error("[chat-emails] run failed", error);
    } finally {
      running = false;
    }
  };
  setInterval(tick, EVERY_MS).unref();
  void tick();
}
