"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { BookOpen, CalendarDays, CircleHelp, FolderOpen, History, LayoutDashboard, LogOut, Menu, PanelsTopLeft, Plug, UserRound, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { signOut } from "@/lib/api/auth";
import { onSignedOut } from "@/lib/api/auth-events";
import { admin } from "@/i18n/admin";
import { common } from "@/i18n/common";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: admin.shell.nav.dashboard, icon: LayoutDashboard, exact: true },
  { href: "/admin/studentet", label: admin.shell.nav.students, icon: Users },
  { href: "/admin/pagesat", label: admin.shell.nav.payments, icon: Wallet },
  { href: "/admin/mesimet", label: admin.shell.nav.lessons, icon: BookOpen },
  { href: "/admin/kalendari", label: admin.shell.nav.calendar, icon: CalendarDays },
  { href: "/admin/materialet", label: admin.shell.nav.materials, icon: FolderOpen },
  { href: "/admin/permbajtja", label: admin.shell.nav.content, icon: PanelsTopLeft },
  { href: "/admin/integrimet", label: admin.shell.nav.integrations, icon: Plug },
  { href: "/admin/historiku", label: admin.shell.nav.history, icon: History },
  { href: "/admin/ndihme", label: admin.shell.nav.help, icon: CircleHelp },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-1">
      {NAV.map((item) => {
        const active = "exact" in item ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Brand() {
  return (
    <Link href="/admin" className="block px-3 font-heading text-2xl leading-tight text-foreground">
      {common.brandFallback}
      <span className="block font-sans text-xs tracking-wide text-muted-foreground uppercase">{admin.shell.title}</span>
    </Link>
  );
}

export function AdminShell({ user, children }: { user: { name: string; email: string }; children: ReactNode }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Signing out in another tab (or an expired session) ends this one too.
  useEffect(() => onSignedOut(() => router.replace("/hyr")), [router]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      router.replace("/hyr");
    }
  }

  const userMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto max-w-full justify-start gap-2 px-2 py-1.5" aria-label={admin.shell.userMenu}>
          <UserRound className="size-4 shrink-0" aria-hidden />
          <span className="truncate text-sm">{user.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="space-y-0.5">
          <span className="block text-sm font-medium text-foreground">{user.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleSignOut} disabled={signingOut}>
          <LogOut aria-hidden /> {signingOut ? admin.shell.signingOut : common.actions.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="flex min-h-full flex-1 bg-background">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-8 border-r bg-card/60 px-3 py-6 lg:flex">
        <Brand />
        <nav aria-label={admin.shell.navLabel} className="flex-1">
          <NavLinks />
        </nav>
        <div className="border-t pt-3">{userMenu}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b bg-background/95 px-4 py-2 lg:hidden">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={admin.shell.openMenu}>
                <Menu aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 gap-6 px-3 py-6">
              <SheetHeader className="p-0">
                <SheetTitle className="sr-only">{admin.shell.navLabel}</SheetTitle>
                <SheetDescription className="sr-only">{admin.shell.title}</SheetDescription>
                <Brand />
              </SheetHeader>
              <nav aria-label={admin.shell.navLabel}>
                <NavLinks onNavigate={() => setMenuOpen(false)} />
              </nav>
            </SheetContent>
          </Sheet>
          <span className="font-heading text-lg">{common.brandFallback}</span>
          {userMenu}
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
