import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { Toaster } from "@/components/ui/sonner";
import { admin } from "@/i18n/admin";
import { requirePageUser } from "@/server/auth/session";

export const metadata: Metadata = {
  title: { default: admin.shell.title, template: `%s · ${admin.shell.title}` },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Layouts don't re-run on every client navigation, so each page also calls requirePageUser.
  const user = await requirePageUser("admin");
  return (
    <>
      <AdminShell user={{ name: user.name, email: user.email }}>{children}</AdminShell>
      <Toaster position="top-center" />
    </>
  );
}
