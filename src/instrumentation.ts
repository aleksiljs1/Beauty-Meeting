/** Runs once when a Next.js server starts: background work that belongs to the web server. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const [{ startLessonReminders }, { startRecordingImports }, { startRecordingCleanup }, { startChatEmails }, { startChatAttachmentCleanup }, { startUploadCleanup }] = await Promise.all([
    import("@/server/jobs/lesson-reminders"),
    import("@/server/jobs/recording-imports"),
    import("@/server/jobs/recording-cleanup"),
    import("@/server/jobs/chat-emails"),
    import("@/server/jobs/chat-attachment-cleanup"),
    import("@/server/jobs/upload-cleanup"),
  ]);
  startLessonReminders();
  startRecordingImports();
  startRecordingCleanup();
  startChatEmails();
  startChatAttachmentCleanup();
  startUploadCleanup();
}
