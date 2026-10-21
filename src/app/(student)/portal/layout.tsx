import type { Metadata } from "next";
import { PortalShell } from "@/components/portal/portal-shell";
import { requirePageUser } from "@/server/auth/session";
import { getAcademyName } from "@/server/queries/portal";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  // Real authorization (the proxy only redirects optimistically). Admins are sent to /admin.
  const user = await requirePageUser("student");
  const academyName = await getAcademyName();
  return (
    <PortalShell user={{ name: user.name, email: user.email }} academyName={academyName}>
      {children}
    </PortalShell>
  );
}
