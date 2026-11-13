import { requireApiUser } from "@/server/auth/session";
import { route } from "@/server/http";
import { audit } from "@/server/services/audit";
import { buildAcademyExport } from "@/server/services/export";

/** Students, payments and attendance as one Excel file (the owner's own copy of the records). */
export const GET = route(async (request) => {
  const admin = await requireApiUser(request, "admin");
  const { file, filename } = await buildAcademyExport();
  await audit(admin.id, "admin.export", "admin", null);
  return new Response(file, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
