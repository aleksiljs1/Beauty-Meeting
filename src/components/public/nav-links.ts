import { publicSite } from "@/i18n/public";

export const NAV_LINKS = [
  { href: "/", label: publicSite.nav.home },
  { href: "/rreth-nesh", label: publicSite.nav.about },
  { href: "/sherbimet", label: publicSite.nav.services },
  { href: "/akademia", label: publicSite.nav.academy },
  { href: "/galeria", label: publicSite.nav.gallery },
  { href: "/kontakt", label: publicSite.nav.contact },
] as const;

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
