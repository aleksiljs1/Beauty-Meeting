import type { Metadata } from "next";
import { ContentPageShell } from "@/components/admin-content/page-shell";
import { SettingsForm } from "@/components/admin-content/settings-form";
import { adminContent } from "@/i18n/admin-content";
import { requirePageUser } from "@/server/auth/session";
import { getSettingsForEdit } from "@/server/services/content";

const s = adminContent.sections.settings;

export const metadata: Metadata = { title: s.title };

export default async function SettingsPage() {
  await requirePageUser("admin");
  const settings = await getSettingsForEdit();
  return (
    <ContentPageShell title={s.title} description={s.description}>
      <SettingsForm initial={settings} />
    </ContentPageShell>
  );
}
