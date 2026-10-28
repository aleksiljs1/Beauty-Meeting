import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { listMaterialLibrary } from "@/server/queries/admin";
import { startFileUpload } from "@/server/services/material-files";
import { startFileUploadSchema } from "@/server/validation/admin";

/** The materials library, newest first; `?ready=1` lists only files that can be added to a lesson. */
export const GET = route(async (request) => {
  await requireApiUser(request, "admin");
  const url = new URL(request.url);
  return ok(await listMaterialLibrary({ q: url.searchParams.get("q") ?? undefined, readyOnly: url.searchParams.get("ready") === "1" }));
});

/** Step 1 of an upload into the library (and into `lessonId`, when given). */
export const POST = route(async (request) => {
  const admin = await requireApiUser(request, "admin");
  const { lessonId, ...file } = startFileUploadSchema.parse(await readJson(request));
  return ok(await startFileUpload(admin, file, lessonId), { status: 201 });
});
