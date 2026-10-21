import { serviceSchema } from "@/lib/content-schemas";
import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { createService, listServicesForAdmin, revalidatePublicContent } from "@/server/services/content";

export const GET = route(async (request) => {
  await requireApiUser(request, "admin");
  return ok(await listServicesForAdmin());
});

export const POST = route(async (request) => {
  const admin = await requireApiUser(request, "admin");
  const input = serviceSchema.parse(await readJson(request));
  const created = await createService(admin, input);
  revalidatePublicContent();
  return ok(created, { status: 201 });
});
