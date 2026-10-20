import { requireApiUser } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { deleteRecording } from "@/server/services/recordings";
import { uuidParam } from "@/server/validation/admin";

export const DELETE = route<RouteContext<"/api/v1/admin/recordings/[id]">>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  await deleteRecording(admin, uuidParam((await params).id, "Regjistrimi nuk u gjet."));
  return ok({ deleted: true });
});
