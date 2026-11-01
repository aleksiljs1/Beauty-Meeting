import { reminderSettingsSchema } from "@/lib/admin-reminders";
import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { getReminderSettings, saveReminderSettings } from "@/server/services/admin-reminders";

export const GET = route(async (request) => {
  const admin = await requireApiUser(request, "admin");
  return ok(await getReminderSettings(admin));
});

export const PUT = route(async (request) => {
  const admin = await requireApiUser(request, "admin");
  return ok(await saveReminderSettings(admin, reminderSettingsSchema.parse(await readJson(request))));
});
