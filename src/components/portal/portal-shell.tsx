"use client";

import { Bell, BookOpen, House, LogOut, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import { useSignOut } from "@/components/auth/use-sign-out";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Toaster } from "@/components/ui/sonner";
import { refreshLiveFeed, useLiveFeed } from "@/hooks/use-live-feed";
import { portalText } from "@/i18n/portal";
import { getAccessToken } from "@/lib/api/access-token";
import { onSignedOut } from "@/lib/api/auth-events";
import { clearSessionHint, setSessionHint } from "@/lib/api/session-hint";
import { cn } from "@/lib/utils";
import { LiveClassAlert } from "./live-class-alert";

const t = portalText.shell;

const NAV = [
  { href: "/portal", label: t.nav.dashboard, icon: House, exact: true },
  { href: "/portal/mesimet", label: t.nav.lessons, icon: BookOpen, exact: false },
  { href: "/portal/njoftimet", label: t.nav.notifications, icon: Bell, exact: false },
] as const;

const isActive = (pathname: string, href: string, exact: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("") || "?"
  );
}

/**
 * Bootstraps the in-memory access token from the session cookie, keeps the session hint in
 * sync and sends the user to login when the session ends (here or in another tab).
 */
function useSessionBootstrap() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    getAccessToken()
      .then((token) => {
        if (cancelled) return;
        if (token) {
          setSessionHint();
          refreshLiveFeed();
        } else {
          clearSessionHint();
          router.replace(`/hyr?next=${encodeURIComponent(pathname)}`);
        }
      })
      .catch(() => undefined); // offline: keep the page; requests will retry
    return () => {
      cancelled = true;
    };
    // Only on mount — the shell persists across portal navigations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () =>
      onSignedOut((reason) => {
        clearSessionHint();
        if (reason === "expired") toast.info(t.sessionExpired);
        router.replace(reason === "expired" ? `/hyr?next=${encodeURIComponent(window.location.pathname)}` : "/hyr");
        router.refresh();
      }),
    [router],
  );
}

export function PortalShell({ user, academyName, children }: { user: { name: string; email: string }; academyName: string; children: ReactNode }) {
  const pathname = usePathname() ?? "/portal";
  const { feed } = useLiveFeed();
  const { signOut, pending } = useSignOut();
  useSessionBootstrap();

  const unread = feed?.unreadCount ?? 0;

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <a
        href="#content"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t.skipToContent}
      </a>

      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/85">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4">
          <Link href="/portal" className="min-w-0 truncate font-heading text-xl tracking-tight">
            {academyName}
          </Link>

          <nav aria-label={t.mainNavLabel} className="ml-6 hidden items-center gap-1 md:flex">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-muted",
                    active ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <Button asChild variant="ghost" size="icon-lg" className="relative">
              <Link href="/portal/njoftimet" aria-label={t.notificationsLabel(unread)}>
                <Bell className="size-5" />
                {unread > 0 ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-0.5 right-0.5 flex min-w-4 items-center justify-center rounded-full bg-rose-deep px-1 text-[10px] leading-4 font-semibold text-primary-foreground"
                  >
                    {unread > 9 ? "9+" : unread}
                  </span>
                ) : null}
              </Link>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-lg" aria-label={t.userMenuLabel} className="rounded-full">
                  <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold" aria-hidden="true">
                    {initials(user.name)}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="grid">
                  <span className="truncate font-medium text-foreground">{user.name}</span>
                  <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/portal/profili">
                    <User />
                    {t.nav.profile}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem disabled={pending} onSelect={() => void signOut()}>
                  <LogOut />
                  {pending ? t.signingOut : t.signOut}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main id="content" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 outline-none md:pb-12">
        {children}
      </main>

      <nav
        aria-label={t.mobileNavLabel}
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {[...NAV, { href: "/portal/profili", label: t.nav.profile, icon: User, exact: false }].map((item) => {
            const active = isActive(pathname, item.href, item.exact);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-16 flex-col items-center justify-center gap-1 text-[11px]",
                    active ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                >
                  <Icon aria-hidden="true" className="size-5" />
                  {item.label}
                  {item.href === "/portal/njoftimet" && unread > 0 ? (
                    <span className="sr-only">{t.notificationsLabel(unread)}</span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <LiveClassAlert aboveBottomNav />
      <Toaster position="top-center" />
    </div>
  );
}
