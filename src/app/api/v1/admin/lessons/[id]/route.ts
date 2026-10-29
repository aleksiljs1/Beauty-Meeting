import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { requireAdminLesson } from "@/server/queries/admin";
import { deleteLesson, updateLesson } from "@/server/services/lessons";
import { updateLessonSchema, uuidParam } from "@/server/validation/admin";
import { zoomText } from "@/i18n/zoom";

const ZOOM_SYNC_WARNING = zoomText.warnings.syncFailed;

type Ctx = RouteContext<"/api/v1/admin/lessons/[id]">;
const lessonId = async (ctx: Ctx) => uuidParam((await ctx.params).id, "Mësimi nuk u gjet.");

export const GET = route<Ctx>(async (request, ctx) => {
  await requireApiUser(request, "admin");
  return ok(await requireAdminLesson(await lessonId(ctx)));
});

export const PATCH = route<Ctx>(async (request, ctx) => {
  const admin = await requireApiUser(request, "admin");
  const id = await lessonId(ctx);
  const { confirmEarlyDeadline, ...patch } = updateLessonSchema.parse(await readJson(request));
  const { zoomSynced } = await updateLesson(id, patch, confirmEarlyDeadline ?? false, admin);
  return ok({ ...(await requireAdminLesson(id)), zoomWarning: zoomSynced ? null : ZOOM_SYNC_WARNING });
});

/** Any lesson that isn't live; its students lose access (see deleteLessons). */
export const DELETE = route<Ctx>(async (request, ctx) => {
  const admin = await requireApiUser(request, "admin");
  await deleteLesson(await lessonId(ctx), admin);
  return ok({ deleted: true });
});
