import { orderSchema } from "@/lib/content-schemas";
import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { reorderCourses, revalidatePublicContent } from "@/server/services/content";

export const PUT = route(async (request) => {
  const admin = await requireApiUser(request, "admin");
  const { ids } = orderSchema.parse(await readJson(request));
  await reorderCourses(admin, ids);
  revalidatePublicContent();
  return ok({ ids });
});
