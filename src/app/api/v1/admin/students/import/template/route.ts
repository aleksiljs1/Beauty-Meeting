import { requireApiUser } from "@/server/auth/session";
import { route } from "@/server/http";
import { prisma } from "@/server/db";
import { buildStudentImportTemplate } from "@/app/api/v1/admin/students/csvparse";

/** The Excel file the admin fills in to import students in bulk. */
export const GET = route(async (request) => {
  await requireApiUser(request, "admin");
  const courses = await prisma.course.findMany({ select: { title: true }, orderBy: { title: "asc" } });
  const file = await buildStudentImportTemplate(courses.map((course) => course.title));
  return new Response(file, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="studentet-shablloni.xlsx"',
      "Cache-Control": "no-store",
    },
  });
});
