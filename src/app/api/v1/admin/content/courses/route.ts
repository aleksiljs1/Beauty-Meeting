import { courseSchema } from "@/lib/content-schemas";
import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { createCourse, listCoursesForAdmin, revalidatePublicContent } from "@/server/services/content";

export const GET = route(async (request) => {
  await requireApiUser(request, "admin");
  return ok(await listCoursesForAdmin());
});

export const POST = route(async (request) => {
  const admin = await requireApiUser(request, "admin");
  const input = courseSchema.parse(await readJson(request));
  const created = await createCourse(admin, input);
  revalidatePublicContent();
  return ok(created, { status: 201 });
});
