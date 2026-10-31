import { z } from "zod";
import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { previewFile } from "@/server/services/materials";
import { uuidParam } from "@/server/validation/admin";

const accessSchema = z.object({ mode: z.enum(["view", "download"]).default("view") });

/** Short-lived preview or download URL of a library file, for the administrator. */
export const POST = route<RouteContext<"/api/v1/admin/library/[id]/access">>(async (request, { params }) => {
  await requireApiUser(request, "admin");
  const mode = request.body ? accessSchema.parse(await readJson(request)).mode : "view";
  return ok(await previewFile(uuidParam((await params).id, "Materiali nuk u gjet."), mode));
});
