import { requireApiUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { ApiError, ok, route } from "@/server/http";
import { grantRecordingPlayback } from "@/server/services/recordings";
import { uuidParam } from "@/server/validation/admin";

/** Short-lived playback URL for the admin preview; request a new one before it expires. */
export const POST = route<RouteContext<"/api/v1/admin/recordings/[id]/playback">>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = uuidParam((await params).id, "Regjistrimi nuk u gjet.");
  const recording = await prisma.recording.findUnique({ where: { id }, select: { lessonId: true } });
  if (!recording) throw new ApiError("NOT_FOUND", "Regjistrimi nuk u gjet.");
  return ok(await grantRecordingPlayback(admin, recording.lessonId, id));
});
