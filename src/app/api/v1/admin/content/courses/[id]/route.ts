import { courseSchema } from "@/lib/content-schemas";
import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { deleteCourse, parseContentId, revalidatePublicContent, updateCourse } from "@/server/services/content";

type Ctx = RouteContext<"/api/v1/admin/content/courses/[id]">;

export const PATCH = route<Ctx>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = parseContentId((await params).id);
  const input = courseSchema.partial().parse(await readJson(request));
  const updated = await updateCourse(admin, id, input);
  revalidatePublicContent();
  return ok(updated);
});

export const DELETE = route<Ctx>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = parseContentId((await params).id);
  await deleteCourse(admin, id, { withLessons: new URL(request.url).searchParams.get("mesimet") === "1" });
  revalidatePublicContent();
  return ok({ id });
});
