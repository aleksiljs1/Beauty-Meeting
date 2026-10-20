import type { Metadata } from "next";
import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import { publicSite } from "@/i18n/public";
import { getPublicSettings } from "@/server/queries/public";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicSettings();
  return {
    title: { default: settings.name, template: `%s · ${settings.name}` },
    description: settings.tagline ?? undefined,
    openGraph: { siteName: settings.name, locale: "sq_AL", type: "website" },
  };
}

export default async function PublicLayout({ children }: LayoutProps<"/">) {
  const settings = await getPublicSettings();
  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {publicSite.nav.skipToContent}
      </a>
      <SiteHeader academyName={settings.name} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter settings={settings} />
    </>
  );
}
