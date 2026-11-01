import type { Metadata } from "next";
import { PageHeader, SectionCard } from "@/components/admin/page-parts";
import { ReminderSettingsForm } from "@/components/admin/settings/reminder-settings-form";
import { admin } from "@/i18n/admin";
import { requirePageUser } from "@/server/auth/session";
import { getReminderSettings } from "@/server/services/admin-reminders";

export const metadata: Metadata = { title: admin.preferences.title };

const t = admin.preferences;

export default async function SettingsPage() {
  const user = await requirePageUser("admin");
  const { accountEmail, ...reminder } = await getReminderSettings(user);

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} intro={t.intro} />
      <SectionCard title={t.reminder.title} description={t.reminder.description}>
        <ReminderSettingsForm initial={reminder} accountEmail={accountEmail} />
      </SectionCard>
    </div>
  );
}
