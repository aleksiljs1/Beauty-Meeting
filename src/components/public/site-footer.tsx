import Link from "next/link";
import { publicSite } from "@/i18n/public";
import { mailtoHref, safeExternalUrl, telHref, whatsappHref } from "@/lib/public-content";
import type { PublicSettings } from "@/server/queries/public";
import { OpeningHours } from "./contact";
import { NAV_LINKS } from "./nav-links";
import { Container } from "./primitives";

const t = publicSite.footer;
const focusClass = "rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
// Gold hairline grows under the link on hover (link-underline in globals.css).
const linkClass = `${focusClass} link-underline hover:text-foreground`;
const socialClass = `${focusClass} underline decoration-muted-foreground/50 underline-offset-4 transition-[color,text-decoration-color] duration-300 hover:text-foreground hover:decoration-rose`;

export function SiteFooter({ settings }: { settings: PublicSettings }) {
  const tel = telHref(settings.phone);
  const mail = mailtoHref(settings.email);
  const wa = whatsappHref(settings.whatsapp);
  const social = [
    { label: "Instagram", href: safeExternalUrl(settings.instagramUrl) },
    { label: "Facebook", href: safeExternalUrl(settings.facebookUrl) },
  ].filter((s): s is { label: string; href: string } => Boolean(s.href));
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-border/70 bg-secondary/60">
      <Container className="grid gap-10 py-14 text-sm sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_0.8fr]">
        <div>
          <p className="font-heading text-2xl">{settings.name}</p>
          {settings.tagline && <p className="mt-3 max-w-xs leading-relaxed text-muted-foreground">{settings.tagline}</p>}
          {social.length > 0 && (
            <ul className="mt-5 flex gap-5">
              {social.map((s) => (
                <li key={s.label}>
                  <a href={s.href} target="_blank" rel="noopener noreferrer" className={`${socialClass} text-muted-foreground`}>
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className="mb-4 font-sans text-xs font-semibold tracking-[0.16em] text-foreground uppercase">{t.contact}</h2>
          <address className="space-y-2 text-muted-foreground not-italic">
            {settings.address && <p>{settings.address}</p>}
            {settings.phone && <p>{tel ? <a className={linkClass} href={tel}>{settings.phone}</a> : settings.phone}</p>}
            {settings.email && <p className="break-words">{mail ? <a className={linkClass} href={mail}>{settings.email}</a> : settings.email}</p>}
            {wa && (
              <p>
                <a className={linkClass} href={wa} target="_blank" rel="noopener noreferrer">
                  WhatsApp
                </a>
              </p>
            )}
          </address>
        </div>

        <div>
          <h2 className="mb-4 font-sans text-xs font-semibold tracking-[0.16em] text-foreground uppercase">{t.hours}</h2>
          <OpeningHours rows={settings.openingHours} className="text-muted-foreground" />
        </div>

        <nav aria-label={t.pages}>
          <h2 className="mb-4 font-sans text-xs font-semibold tracking-[0.16em] text-foreground uppercase">{t.pages}</h2>
          <ul className="space-y-2 text-muted-foreground">
            {NAV_LINKS.slice(1).map((link) => (
              <li key={link.href}>
                <Link className={linkClass} href={link.href}>
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <Link className={linkClass} href="/hyr">
                {t.studentPortal}
              </Link>
            </li>
          </ul>
        </nav>
      </Container>
      <div className="border-t border-border/70">
        <Container className="flex flex-col gap-3 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {settings.name}. {t.rights}
          </p>
          <ul className="flex gap-5">
            <li>
              <Link className={linkClass} href="/privatesia">
                {t.privacy}
              </Link>
            </li>
            <li>
              <Link className={linkClass} href="/kushtet">
                {t.terms}
              </Link>
            </li>
          </ul>
        </Container>
      </div>
    </footer>
  );
}
