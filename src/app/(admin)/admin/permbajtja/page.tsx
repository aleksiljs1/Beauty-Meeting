import { ExternalLinkIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ContentPageShell } from "@/components/admin-content/page-shell";
import { adminContent } from "@/i18n/admin-content";
import { requirePageUser } from "@/server/auth/session";

export const metadata: Metadata = { title: adminContent.title };

const sections = [
  { href: "/admin/permbajtja/te-dhenat", ...adminContent.sections.settings },
  { href: "/admin/permbajtja/sherbimet", ...adminContent.sections.services },
  { href: "/admin/permbajtja/kurset", ...adminContent.sections.courses },
  { href: "/admin/permbajtja/galeria", ...adminContent.sections.gallery },
] as const;

export default async function ContentHomePage() {
  await requirePageUser("admin");
  return (
    <ContentPageShell title={adminContent.title} description={adminContent.intro} back={false}>
      <ul className="grid gap-4 sm:grid-cols-2">
        {sections.map((section) => (
          <li key={section.href}>
            <Link
              href={section.href}
              className="block h-full rounded-md border bg-card p-6 transition-colors hover:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <h2 className="text-2xl">{section.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{section.description}</p>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-sm">
        <a href="/" target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 underline underline-offset-4">
          {adminContent.viewSite}
          <ExternalLinkIcon className="size-3.5" aria-hidden />
        </a>
      </p>
    </ContentPageShell>
  );
}
