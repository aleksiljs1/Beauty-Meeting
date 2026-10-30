import { z } from "zod";
import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { listLessons } from "@/server/queries/admin";
import { createLesson, createRepeatingLesson, deleteFilteredLessons } from "@/server/services/lessons";
import { createLessonSchema, pageQuery } from "@/server/validation/admin";

const filterSchema = z.object({
  publication: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED", "CANCELLED"]).optional().catch(undefined),
  when: z.enum(["upcoming", "past"]).optional().catch(undefined),
});

const readFilter = (url: URL) => filterSchema.parse({ publication: url.searchParams.get("publication") ?? undefined, when: url.searchParams.get("when") ?? undefined });

export const GET = route(async (request) => {
  await requireApiUser(request, "admin");
  const url = new URL(request.url);
  return ok(await listLessons({ ...readFilter(url), page: pageQuery(url.searchParams.get("page")) }));
});

/** Bulk delete of the lessons matching the list's filter: `scope=drafts` (only drafts) or `scope=all`. */
export const DELETE = route(async (request) => {
  const admin = await requireApiUser(request, "admin");
  const url = new URL(request.url);
  const scope = z.enum(["drafts", "all"]).parse(url.searchParams.get("scope"));
  return ok(await deleteFilteredLessons(readFilter(url), scope, admin));
});

export const POST = route(async (request) => {
  const admin = await requireApiUser(request, "admin");
  const { confirmEarlyDeadline, studentIds, repeat, ...input } = createLessonSchema.parse(await readJson(request));
  const lesson = repeat
    ? await createRepeatingLesson(input, repeat, confirmEarlyDeadline ?? false, admin, studentIds)
    : { ...(await createLesson(input, confirmEarlyDeadline ?? false, admin, studentIds)), seriesId: null, count: 1 };
  return ok(lesson, { status: 201 });
});
