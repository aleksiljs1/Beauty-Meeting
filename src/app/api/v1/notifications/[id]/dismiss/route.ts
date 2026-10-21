import { z } from "zod";
import { requireApiUser } from "@/server/auth/session";
import { ApiError, ok, route } from "@/server/http";
import { dismissNotification } from "@/server/services/live";

/** Pop-up acknowledged ("Më vonë"). Idempotent; does not mark the notification read. */
export const POST = route<RouteContext<"/api/v1/notifications/[id]/dismiss">>(async (request, { params }) => {
  const user = await requireApiUser(request);
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) throw new ApiError("NOT_FOUND", "Njoftimi nuk u gjet.");
  await dismissNotification(user, parsed.data);
  return ok({ dismissed: true });
});
