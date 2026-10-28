import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { cancelPayment } from "@/server/services/payments";
import { cancelPaymentSchema, uuidParam } from "@/server/validation/admin";

/** Cancels a payment recorded by mistake; it stays in the history, marked as cancelled. */
export const POST = route<RouteContext<"/api/v1/admin/payments/[id]/cancel">>(async (request, { params }) => {
  const admin = await requireApiUser(request, "admin");
  const id = uuidParam((await params).id, "Pagesa nuk u gjet.");
  const { reason } = cancelPaymentSchema.parse(await readJson(request));
  await cancelPayment(id, reason, admin);
  return ok({ id });
});
