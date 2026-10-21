import type { Metadata } from "next";
import { CoursesEditor } from "@/components/admin-content/courses-editor";
import { ContentPageShell } from "@/components/admin-content/page-shell";
import { adminContent } from "@/i18n/admin-content";
import { requirePageUser } from "@/server/auth/session";
import { listCoursesForAdmin } from "@/server/services/content";

const s = adminContent.sections.courses;

export const metadata: Metadata = { title: s.title };

export default async function CoursesAdminPage() {
  await requirePageUser("admin");
  const courses = await listCoursesForAdmin();
  return (
    <ContentPageShell title={s.title} description={s.description}>
      <CoursesEditor initial={courses} />
    </ContentPageShell>
  );
}
