import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { revokeInvitation } from "@/server/services/invitations";
import { uuidParam } from "@/server/validation/admin";

/** Revoking a link stops new enrolments only; existing enrolments are untouched. */
export const POST = route<RouteContext<"/api/v1/admin/invitations/[id]/revoke">>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  await revokeInvitation(uuidParam((await params).id, "Ftesa nuk u gjet."), admin);
  return ok({ revoked: true });
});
