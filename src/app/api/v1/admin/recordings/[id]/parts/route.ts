import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { presignRecordingParts } from "@/server/services/recordings";
import { presignPartsSchema, uuidParam } from "@/server/validation/admin";

export const POST = route<RouteContext<"/api/v1/admin/recordings/[id]/parts">>(async (request, { params }) => {
  await requireApiUser(request, "admin");
  const id = uuidParam((await params).id, "Regjistrimi nuk u gjet.");
  const { partNumbers } = presignPartsSchema.parse(await readJson(request));
  return ok(await presignRecordingParts(id, partNumbers));
});
