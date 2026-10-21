import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { searchStudentsForLesson } from "@/server/queries/admin";
import { uuidParam } from "@/server/validation/admin";

export const GET = route<RouteContext<"/api/v1/admin/lessons/[id]/student-search">>(async (request, { params }) => {
  await requireApiUser(request, "admin");
  const id = uuidParam((await params).id, "Mësimi nuk u gjet.");
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  return ok(q.length < 2 ? [] : await searchStudentsForLesson(id, q));
});
