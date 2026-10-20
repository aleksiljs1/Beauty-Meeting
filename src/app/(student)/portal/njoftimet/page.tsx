import type { Metadata } from "next";
import { NotificationsList } from "@/components/portal/notifications-list";
import { portalText } from "@/i18n/portal";
import { requirePageUser } from "@/server/auth/session";
import { getLiveFeed } from "@/server/services/live";

export const metadata: Metadata = { title: portalText.notifications.metaTitle };

export default async function NotificationsPage() {
  const user = await requirePageUser("student");
  const feed = await getLiveFeed(user);
  return <NotificationsList initial={feed} />;
}
