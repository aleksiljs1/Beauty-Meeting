import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { listLessonInvitations } from "@/server/queries/admin";
import { createInvitation } from "@/server/services/invitations";
import { createInvitationSchema, uuidParam } from "@/server/validation/admin";

type Ctx = RouteContext<"/api/v1/admin/lessons/[id]/invitations">;

export const GET = route<Ctx>(async (request, { params }) => {
  await requireApiUser(request, "admin");
  return ok(await listLessonInvitations(uuidParam((await params).id, "Mësimi nuk u gjet.")));
});

/** The plaintext link is returned exactly once, here. Lists only show counts and status. */
export const POST = route<Ctx>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const lessonId = uuidParam((await params).id, "Mësimi nuk u gjet.");
  const input = createInvitationSchema.parse(await readJson(request));
  const invitation = await createInvitation({ lessonId, ...input }, admin);
  return ok(invitation, { status: 201 });
});
