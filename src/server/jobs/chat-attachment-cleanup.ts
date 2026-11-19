import "server-only";
import { deleteUnsentAttachments } from "@/server/services/chat-attachments";

const EVERY_MS = 60 * 60_000;

/**
 * Deletes chat photos and files that were picked but never sent, a day later
 * (services/chat-attachments.ts), once an hour. Started once per server process (instrumentation.ts).
 */
export function startChatAttachmentCleanup() {
  const state = globalThis as typeof globalThis & { chatAttachmentCleanupStarted?: boolean };
  if (state.chatAttachmentCleanupStarted) return;
  state.chatAttachmentCleanupStarted = true;

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const deleted = await deleteUnsentAttachments();
      if (deleted) console.info(`[chat-attachments] deleted ${deleted} unsent upload(s)`);
    } catch (error) {
      console.error("[chat-attachments] cleanup run failed", (error as Error).message);
    } finally {
      running = false;
    }
  };
  setInterval(tick, EVERY_MS).unref();
  void tick();
}
