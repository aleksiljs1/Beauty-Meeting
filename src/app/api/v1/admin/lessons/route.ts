import { z } from "zod";
import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { listLessons } from "@/server/queries/admin";
import { createLesson, createRepeatingLesson } from "@/server/services/lessons";
import { createLessonSchema, pageQuery } from "@/server/validation/admin";

const filterSchema = z.object({
  publication: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED", "CANCELLED"]).optional().catch(undefined),
  when: z.enum(["upcoming", "past"]).optional().catch(undefined),
});

export const GET = route(async (request) => {
  await requireApiUser(request, "admin");
  const url = new URL(request.url);
  const filter = filterSchema.parse({ publication: url.searchParams.get("publication") ?? undefined, when: url.searchParams.get("when") ?? undefined });
  return ok(await listLessons({ ...filter, page: pageQuery(url.searchParams.get("page")) }));
});

export const POST = route(async (request) => {
  const admin = await requireApiUser(request, "admin");
  const { confirmEarlyDeadline, studentIds, repeat, ...input } = createLessonSchema.parse(await readJson(request));
  const lesson = repeat
    ? await createRepeatingLesson(input, repeat, confirmEarlyDeadline ?? false, admin, studentIds)
    : { ...(await createLesson(input, confirmEarlyDeadline ?? false, admin, studentIds)), seriesId: null, count: 1 };
  return ok(lesson, { status: 201 });
});
