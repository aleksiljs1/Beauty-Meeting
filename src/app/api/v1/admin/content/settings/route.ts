import { settingsSchema } from "@/lib/content-schemas";
import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { getSettingsForEdit, revalidatePublicContent, updateSettings } from "@/server/services/content";

export const GET = route(async (request) => {
  await requireApiUser(request, "admin");
  return ok(await getSettingsForEdit());
});

export const PUT = route(async (request) => {
  const admin = await requireApiUser(request, "admin");
  const input = settingsSchema.parse(await readJson(request));
  const settings = await updateSettings(admin, input);
  revalidatePublicContent();
  return ok(settings);
});
