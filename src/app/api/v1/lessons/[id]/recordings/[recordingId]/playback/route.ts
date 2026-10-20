import { z } from "zod";
import { requireApiUser } from "@/server/auth/session";
import { ApiError, ok, route } from "@/server/http";
import { parseLessonId } from "@/server/queries/portal";
import { grantRecordingPlayback } from "@/server/services/recordings";

/** 5-minute playback URL (bounded by the deadline); the player renews it before expiry. */
export const POST = route<RouteContext<"/api/v1/lessons/[id]/recordings/[recordingId]/playback">>(async (request, { params }) => {
  const user = await requireApiUser(request);
  const { id, recordingId } = await params;
  const lessonId = parseLessonId(id);
  const recording = z.uuid().safeParse(recordingId);
  if (!recording.success) throw new ApiError("NOT_FOUND", "Regjistrimi nuk është i disponueshëm.");
  return ok(await grantRecordingPlayback(user, lessonId, recording.data));
});
