import Link from "next/link";
import { publicSite } from "@/i18n/public";
import { Container } from "./primitives";
import { DesktopNav, MobileNav } from "./site-nav";

export function SiteHeader({ academyName }: { academyName: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/95 supports-[backdrop-filter]:bg-background/90">
      <Container className="flex h-16 items-center justify-between gap-4 sm:h-20">
        <Link
          href="/"
          className="min-w-0 truncate rounded-sm font-heading text-2xl leading-none tracking-tight text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:text-[1.7rem]"
        >
          {academyName}
        </Link>
        <div className="flex items-center gap-2 md:gap-8">
          <DesktopNav />
          <Link
            href="/hyr"
            className="hidden h-10 items-center rounded-md border border-foreground/25 px-5 text-sm font-medium hover:border-foreground/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:inline-flex"
          >
            {publicSite.nav.signIn}
          </Link>
          <MobileNav academyName={academyName} />
        </div>
      </Container>
    </header>
  );
}
