import type { Metadata } from "next";
import { GalleryEditor } from "@/components/admin-content/gallery-editor";
import { ContentPageShell } from "@/components/admin-content/page-shell";
import { adminContent } from "@/i18n/admin-content";
import { requirePageUser } from "@/server/auth/session";
import { listGalleryForAdmin } from "@/server/services/content";

const s = adminContent.sections.gallery;

export const metadata: Metadata = { title: s.title };

export default async function GalleryAdminPage() {
  await requirePageUser("admin");
  const items = await listGalleryForAdmin();
  return (
    <ContentPageShell title={s.title} description={s.description}>
      <GalleryEditor initial={items} />
    </ContentPageShell>
  );
}
