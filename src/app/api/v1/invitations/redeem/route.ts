import { z } from "zod";
import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { redeemInvitation } from "@/server/services/invitations";

const bodySchema = z.object({ token: z.string().min(20).max(100) });

/** Explicit enrolment through a shared lesson link (opening the page itself never enrolls). */
export const POST = route(async (request) => {
  const user = await requireApiUser(request, "student");
  const { token } = bodySchema.parse(await readJson(request));
  return ok(await redeemInvitation(token, user));
});
