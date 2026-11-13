import { env } from "@/server/env";
import { requireLessonCapability } from "@/server/access/lesson-access";
import { requirePageUser } from "@/server/auth/session";
import { ApiError } from "@/server/http";
import { parseLessonId } from "@/server/queries/portal";
import { lessonIcs } from "@/lib/ics";

/**
 * "Shto në kalendar": the lesson as an .ics file (phone and computer calendars open it). Only
 * the title, time and a link to the lesson page: never the meeting link, which the site hands out
 * at join time after re-checking access.
 */
export async function GET(_request: Request, ctx: RouteContext<"/portal/mesimet/[id]/kalendar">) {
  const user = await requirePageUser("student");
  try {
    const { lesson } = await requireLessonCapability(user, parseLessonId((await ctx.params).id), "VIEW_CARD");
    const url = new URL(`/portal/mesimet/${lesson.id}`, env.APP_URL).toString();
    const body = lessonIcs({ id: lesson.id, title: lesson.title, start: lesson.scheduledStartAt, end: lesson.scheduledEndAt, url, host: new URL(env.APP_URL).hostname });
    return new Response(body, {
      headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="mesimi.ics"', "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ApiError) return new Response("Ky mësim nuk është i disponueshëm.", { status: 404 });
    throw error;
  }
}
