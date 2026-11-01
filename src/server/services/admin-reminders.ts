import "server-only";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { sendMail } from "@/server/mail";
import { lessonReminderEmail } from "@/server/mail/templates";
import { formatDateTime, timezoneAbbreviation } from "@/lib/datetime";
import { formatLead, type ReminderSettings } from "@/lib/admin-reminders";
import { audit } from "./audit";

const MINUTE = 60_000;

export async function getReminderSettings(admin: AppUser): Promise<ReminderSettings & { accountEmail: string }> {
  const prefs = await prisma.adminPreferences.findUnique({ where: { userId: admin.id } });
  return {
    enabled: prefs?.lessonReminderEnabled ?? false,
    minutes: prefs?.lessonReminderMinutes ?? 60,
    email: prefs?.reminderEmail ?? "",
    accountEmail: admin.email,
  };
}

export async function saveReminderSettings(admin: AppUser, input: ReminderSettings) {
  const data = { lessonReminderEnabled: input.enabled, lessonReminderMinutes: input.minutes, reminderEmail: input.email || null };
  await prisma.adminPreferences.upsert({ where: { userId: admin.id }, create: { userId: admin.id, ...data }, update: data });
  await audit(admin.id, "admin.reminders", "user", admin.id, { enabled: input.enabled, minutes: input.minutes });
  return getReminderSettings(admin);
}

/**
 * Emails every admin who asked for it about each published lesson starting within their lead
 * time. Run every minute; the AdminLessonReminder row is claimed before sending, so overlapping
 * runs (or several server instances) never send the same reminder twice. A failed send gives the
 * claim back, so the next run tries again until the lesson starts. Returns the number sent.
 */
export async function sendDueLessonReminders(now = new Date()): Promise<number> {
  const admins = await prisma.adminPreferences.findMany({
    where: { lessonReminderEnabled: true, user: { role: "admin", banned: { not: true } } },
    select: { lessonReminderMinutes: true, reminderEmail: true, user: { select: { id: true, name: true, email: true } } },
  });
  if (!admins.length) return 0;

  let academyName: string | undefined;
  let sent = 0;
  for (const { lessonReminderMinutes, reminderEmail, user } of admins) {
    const lessons = await prisma.lesson.findMany({
      where: {
        publication: "PUBLISHED",
        isDemo: false,
        meetingStatus: { notIn: ["LIVE", "ENDED"] },
        scheduledStartAt: { gt: now, lte: new Date(now.getTime() + lessonReminderMinutes * MINUTE) },
      },
      select: { id: true, title: true, scheduledStartAt: true },
    });
    for (const lesson of lessons) {
      const claim = { userId: user.id, lessonId: lesson.id, startsAt: lesson.scheduledStartAt };
      const { count } = await prisma.adminLessonReminder.createMany({ data: [claim], skipDuplicates: true });
      if (!count) continue; // already reminded (or another run is sending it right now)

      academyName ??= (await prisma.academySettings.findUnique({ where: { id: 1 }, select: { name: true } }))?.name ?? "Akademia CEM";
      const left = Math.max(1, Math.round((lesson.scheduledStartAt.getTime() - now.getTime()) / MINUTE));
      try {
        await sendMail(
          lessonReminderEmail({
            to: reminderEmail ?? user.email,
            name: user.name,
            lessonTitle: lesson.title,
            when: `${formatDateTime(lesson.scheduledStartAt)} (${timezoneAbbreviation(lesson.scheduledStartAt)})`,
            left: formatLead(left),
            url: new URL(`/admin/mesimet/${lesson.id}`, env.APP_URL).toString(),
            academyName,
          }),
        );
        sent += 1;
      } catch (error) {
        console.error("[reminders] email failed", lesson.id, error);
        await prisma.adminLessonReminder.delete({ where: { userId_lessonId_startsAt: claim } }).catch(() => undefined);
      }
    }
  }
  return sent;
}
