import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { listRecordings, startRecordingUpload } from "@/server/services/recordings";
import { startUploadSchema, uuidParam } from "@/server/validation/admin";

type Ctx = RouteContext<"/api/v1/admin/lessons/[id]/recordings">;

export const GET = route<Ctx>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  return ok(await listRecordings(admin, uuidParam((await params).id, "Mësimi nuk u gjet.")));
});

/** Starts a multipart upload; part URLs are requested in batches from /recordings/[id]/parts. */
export const POST = route<Ctx>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const lessonId = uuidParam((await params).id, "Mësimi nuk u gjet.");
  const file = startUploadSchema.parse(await readJson(request));
  return ok(await startRecordingUpload(admin, lessonId, file), { status: 201 });
});
