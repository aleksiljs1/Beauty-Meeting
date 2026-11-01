/** Runs once when a Next.js server starts: background work that belongs to the web server. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { startLessonReminders } = await import("@/server/jobs/lesson-reminders");
  startLessonReminders();
}
