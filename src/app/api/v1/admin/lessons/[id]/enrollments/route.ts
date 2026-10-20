import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { getLessonRoster } from "@/server/queries/admin";
import { grantEnrollment } from "@/server/services/enrollments";
import { grantEnrollmentSchema, pageQuery, uuidParam } from "@/server/validation/admin";

type Ctx = RouteContext<"/api/v1/admin/lessons/[id]/enrollments">;

export const GET = route<Ctx>(async (request, { params }) => {
  await requireApiUser(request, "admin");
  const id = uuidParam((await params).id, "Mësimi nuk u gjet.");
  return ok(await getLessonRoster(id, pageQuery(new URL(request.url).searchParams.get("page"))));
});

/** Adds an existing student (a previously revoked enrolment is re-granted). */
export const POST = route<Ctx>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = uuidParam((await params).id, "Mësimi nuk u gjet.");
  const input = grantEnrollmentSchema.parse(await readJson(request));
  const enrollment = await grantEnrollment(id, input.userId, admin, input.accessExpiresAt ?? null);
  return ok(enrollment, { status: 201 });
});
