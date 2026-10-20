import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { requireAdminLesson } from "@/server/queries/admin";
import { runDemoAction } from "@/server/services/lessons";
import { demoActionSchema, uuidParam } from "@/server/validation/admin";

/** Labelled demo classroom simulation (ZOOM_MODE=demo, isDemo lessons only). */
export const POST = route<RouteContext<"/api/v1/admin/lessons/[id]/demo">>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = uuidParam((await params).id, "Mësimi nuk u gjet.");
  const { action } = demoActionSchema.parse(await readJson(request));
  await runDemoAction(id, action, admin);
  const lesson = await requireAdminLesson(id);
  return ok({ meetingStatus: lesson.meetingStatus, liveStartedAt: lesson.liveStartedAt, liveEndedAt: lesson.liveEndedAt });
});
