import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { abortRecordingUpload } from "@/server/services/recordings";
import { uuidParam } from "@/server/validation/admin";

export const POST = route<RouteContext<"/api/v1/admin/recordings/[id]/abort">>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  await abortRecordingUpload(admin, uuidParam((await params).id, "Regjistrimi nuk u gjet."));
  return ok({ aborted: true });
});
