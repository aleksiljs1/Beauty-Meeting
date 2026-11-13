"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { BarChart3, BookOpen, CalendarDays, CircleHelp, FolderOpen, History, LayoutDashboard, LogOut, Menu, PanelsTopLeft, Plug, Settings, Star, UserRound, Users, Wallet } from "lucide-react";
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
import { statsText } from "@/i18n/stats";
import { common } from "@/i18n/common";
import { SHOW_BRAND_NAME } from "@/lib/brand";
import { ClassAlertBanner } from "./class-alert-banner";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: admin.shell.nav.dashboard, icon: LayoutDashboard, exact: true },
  { href: "/admin/statistikat", label: statsText.nav, icon: BarChart3 },
  { href: "/admin/studentet", label: admin.shell.nav.students, icon: Users },
  { href: "/admin/pagesat", label: admin.shell.nav.payments, icon: Wallet },
  { href: "/admin/mesimet", label: admin.shell.nav.lessons, icon: BookOpen },
  { href: "/admin/kalendari", label: admin.shell.nav.calendar, icon: CalendarDays },
  { href: "/admin/vleresimet", label: admin.shell.nav.feedback, icon: Star },
  { href: "/admin/materialet", label: admin.shell.nav.materials, icon: FolderOpen },
  { href: "/admin/permbajtja", label: admin.shell.nav.content, icon: PanelsTopLeft },
  { href: "/admin/integrimet", label: admin.shell.nav.integrations, icon: Plug },
  { href: "/admin/cilesimet", label: admin.shell.nav.settings, icon: Settings },
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
                "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                // The current page: a gold bar at the edge and a warm wash.
                "before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:origin-center before:scale-y-0 before:rounded-full before:bg-rose before:transition-transform before:duration-300",
                active
                  ? "bg-gradient-to-r from-rose/15 to-transparent font-medium text-foreground before:scale-y-100"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              <Icon
                className={cn("size-4 transition-colors duration-200", active ? "text-rose-deep" : "group-hover:text-rose-deep")}
                aria-hidden
              />
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
      {SHOW_BRAND_NAME && common.brandFallback}
      <span className="mt-1 flex items-center gap-2 font-sans text-xs tracking-[0.16em] text-rose-deep uppercase">
        <span aria-hidden className="h-px w-5 bg-rose/70" />
        {admin.shell.title}
      </span>
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
    <div className="flex min-h-full flex-1">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r bg-card/60 px-3 py-6 backdrop-blur-sm lg:flex">
        <Brand />
        {/* Scrolls on its own on short screens, so the account menu below stays reachable. */}
        <nav aria-label={admin.shell.navLabel} className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
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
            <SheetContent side="left" className="w-72 gap-6 overflow-y-auto px-3 py-6">
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
          {SHOW_BRAND_NAME && <span className="font-heading text-lg">{common.brandFallback}</span>}
          {userMenu}
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <ClassAlertBanner />
          {children}
        </main>
      </div>
    </div>
  );
}
