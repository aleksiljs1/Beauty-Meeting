import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { completeRecordingUpload } from "@/server/services/recordings";
import { completeRecordingSchema, uuidParam } from "@/server/validation/admin";

export const POST = route<RouteContext<"/api/v1/admin/recordings/[id]/complete">>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = uuidParam((await params).id, "Regjistrimi nuk u gjet.");
  const { parts } = completeRecordingSchema.parse(await readJson(request));
  return ok(await completeRecordingUpload(admin, id, parts));
});
