"use client";

import { MenuIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { publicSite } from "@/i18n/public";
import { cn } from "@/lib/utils";
import { isActive, NAV_LINKS } from "./nav-links";

const t = publicSite.nav;

/** Desktop navigation (md and up). */
export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav aria-label={t.mainNav} className="hidden md:block">
      <ul className="flex items-center gap-7">
        {NAV_LINKS.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-sm py-1 text-sm tracking-wide text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  active && "text-foreground underline decoration-rose underline-offset-8",
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Mobile navigation in a sheet (below md). */
export function MobileNav({ academyName }: { academyName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="inline-flex size-11 items-center justify-center rounded-md text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:hidden"
        aria-label={t.openMenu}
      >
        <MenuIcon className="size-5" aria-hidden />
      </SheetTrigger>
      {/* Own close button: the kit's default has an English screen-reader label. */}
      <SheetContent side="right" className="w-[85vw] max-w-sm bg-background" showCloseButton={false}>
        <SheetHeader className="flex-row items-center justify-between gap-3 border-b py-4 pr-3 pl-6">
          <SheetTitle className="text-xl">{academyName}</SheetTitle>
          <SheetDescription className="sr-only">{t.menu}</SheetDescription>
          <SheetClose
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={t.closeMenu}
          >
            <XIcon className="size-5" aria-hidden />
          </SheetClose>
        </SheetHeader>
        <nav aria-label={t.mainNav} className="px-3">
          <ul className="flex flex-col">
            {NAV_LINKS.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <li key={link.href}>
                  <SheetClose asChild>
                    <Link
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "block rounded-md px-3 py-3 font-heading text-2xl text-foreground/80 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        active && "text-rose-deep",
                      )}
                    >
                      {link.label}
                    </Link>
                  </SheetClose>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="mt-auto border-t px-6 py-5">
          <SheetClose asChild>
            <Link
              href="/hyr"
              className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/85 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              {t.signIn}
            </Link>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}
