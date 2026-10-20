import type { Metadata } from "next";
import { ContentPageShell } from "@/components/admin-content/page-shell";
import { ServicesEditor } from "@/components/admin-content/services-editor";
import { adminContent } from "@/i18n/admin-content";
import { requirePageUser } from "@/server/auth/session";
import { listServicesForAdmin } from "@/server/services/content";

const s = adminContent.sections.services;

export const metadata: Metadata = { title: s.title };

export default async function ServicesAdminPage() {
  await requirePageUser("admin");
  const services = await listServicesForAdmin();
  return (
    <ContentPageShell title={s.title} description={s.description}>
      <ServicesEditor initial={services} />
    </ContentPageShell>
  );
}
