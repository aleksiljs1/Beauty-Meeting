import { z } from "zod";
import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { markNotificationsRead } from "@/server/services/live";

const bodySchema = z.object({
  ids: z.union([z.literal("all"), z.array(z.uuid()).min(1).max(100)]),
});

export const POST = route(async (request) => {
  const user = await requireApiUser(request);
  const { ids } = bodySchema.parse(await readJson(request));
  await markNotificationsRead(user, ids);
  return ok({ read: true });
});
