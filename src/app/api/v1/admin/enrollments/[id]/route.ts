import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { restoreEnrollment, revokeEnrollment, setEnrollmentDeadline } from "@/server/services/enrollments";
import { updateEnrollmentSchema, uuidParam } from "@/server/validation/admin";

/** Revoke / re-grant (`revoked`) and set or clear (`accessExpiresAt: null`) the student's own deadline. */
export const PATCH = route<RouteContext<"/api/v1/admin/enrollments/[id]">>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = uuidParam((await params).id, "Regjistrimi nuk u gjet.");
  const input = updateEnrollmentSchema.parse(await readJson(request));
  if (input.accessExpiresAt !== undefined) await setEnrollmentDeadline(id, input.accessExpiresAt, admin);
  if (input.revoked === true) await revokeEnrollment(id, admin);
  if (input.revoked === false) await restoreEnrollment(id, admin);
  return ok({ id });
});
