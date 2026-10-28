import { requireApiUser } from "@/server/auth/session";
import { ok, readJson, route } from "@/server/http";
import { getPaymentHistory } from "@/server/queries/payments";
import { recordPayment } from "@/server/services/payments";
import { paymentAccountQuery, recordPaymentSchema } from "@/server/validation/admin";

/** One student's payment history for a course. */
export const GET = route(async (request) => {
  await requireApiUser(request, "admin");
  const params = new URL(request.url).searchParams;
  const { courseId, userId } = paymentAccountQuery.parse({ courseId: params.get("courseId"), userId: params.get("userId") });
  return ok(await getPaymentHistory(courseId, userId));
});

/** Records a payment made outside the site (cash or bank transfer). */
export const POST = route(async (request) => {
  const admin = await requireApiUser(request, "admin");
  const input = recordPaymentSchema.parse(await readJson(request));
  return ok(await recordPayment(input, admin), { status: 201 });
});
