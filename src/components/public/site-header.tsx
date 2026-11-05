import Link from "next/link";
import { publicSite } from "@/i18n/public";
import { SHOW_BRAND_NAME } from "@/lib/brand";
import { Container } from "./primitives";
import { DesktopNav, MobileNav } from "./site-nav";

export function SiteHeader({ academyName }: { academyName: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/95 supports-[backdrop-filter]:bg-background/90">
      <Container className="flex h-16 items-center justify-between gap-4 sm:h-20">
        {SHOW_BRAND_NAME && (
          <Link
            href="/"
            className="min-w-0 truncate rounded-sm font-heading text-[1.75rem] leading-none max-[359px]:text-2xl tracking-tight text-foreground transition-colors duration-300 hover:text-rose-deep focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:text-[1.85rem]"
          >
            {academyName}
          </Link>
        )}
        <div className="ml-auto flex items-center gap-2 md:gap-8">
          <DesktopNav />
          <Link
            href="/hyr"
            className="inline-flex h-9 shrink-0 items-center rounded-md border border-foreground/25 px-3 text-sm md:h-10 md:px-5 font-medium transition-[color,background-color,border-color,box-shadow,translate] duration-300 hover:border-rose hover:bg-rose hover:text-primary-foreground hover:shadow-[0_6px_20px_-8px_var(--rose)] motion-safe:hover:-translate-y-0.5 active:translate-y-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {publicSite.nav.signIn}
          </Link>
          <MobileNav academyName={academyName} />
        </div>
      </Container>
    </header>
  );
}
