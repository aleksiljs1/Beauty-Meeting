import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { deleteSeries, updateSeries } from "@/server/services/lesson-series";
import { updateSeriesSchema, uuidParam } from "@/server/validation/admin";
import { zoomText } from "@/i18n/zoom";

type Ctx = RouteContext<"/api/v1/admin/series/[id]">;
const seriesId = async (ctx: Ctx) => uuidParam((await ctx.params).id, "Seria nuk u gjet.");

/** Same change for every upcoming date of the series. */
export const PATCH = route<Ctx>(async (request, ctx) => {
  const admin = await requireApiUser(request, "admin");
  const { confirmEarlyDeadline, ...patch } = updateSeriesSchema.parse(await readJson(request));
  const { count, zoomSynced } = await updateSeries(await seriesId(ctx), patch, confirmEarlyDeadline ?? false, admin);
  return ok({ count, zoomWarning: zoomSynced ? null : zoomText.warnings.syncFailed });
});

/** `?te-ardhshme=1` deletes only the dates that haven't ended. */
export const DELETE = route<Ctx>(async (request, ctx) => {
  const admin = await requireApiUser(request, "admin");
  const upcomingOnly = new URL(request.url).searchParams.get("te-ardhshme") === "1";
  return ok(await deleteSeries(await seriesId(ctx), admin, { upcomingOnly }));
});
