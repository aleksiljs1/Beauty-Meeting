import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { resendSetupEmail } from "@/server/services/students";
import { userIdParam } from "@/server/validation/admin";

export const POST = route<RouteContext<"/api/v1/admin/students/[id]/setup-email">>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  await resendSetupEmail(userIdParam((await params).id), admin);
  return ok({ sent: true });
});
