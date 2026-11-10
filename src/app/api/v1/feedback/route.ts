import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { feedbackInputSchema, submitFeedback } from "@/server/services/feedback";

/** A student rates an ended lesson or course (again = change it), or sends feedback on the app. */
export const POST = route(async (request) => {
  const user = await requireApiUser(request, "student");
  return ok(await submitFeedback(user, feedbackInputSchema.parse(await readJson(request))));
});
