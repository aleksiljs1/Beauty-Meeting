import { ExternalLinkIcon, MapPinIcon } from "lucide-react";
import type { Metadata } from "next";
import { ContactActions, OpeningHours } from "@/components/public/contact";
import { Container, LinkButton, PageHeader } from "@/components/public/primitives";
import { publicSite } from "@/i18n/public";
import { mailtoHref, safeExternalUrl, telHref, whatsappHref } from "@/lib/public-content";
import { getPublicSettings } from "@/server/queries/public";

const t = publicSite.contact;

export const metadata: Metadata = { title: t.title, description: t.description };

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border/80 py-6">
      <dt className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-2 text-lg">{children}</dd>
    </div>
  );
}

const linkClass = "rounded-sm underline decoration-rose/60 underline-offset-4 hover:decoration-rose-deep focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export default async function ContactPage() {
  const settings = await getPublicSettings();
  const tel = telHref(settings.phone);
  const mail = mailtoHref(settings.email);
  const wa = whatsappHref(settings.whatsapp);
  const map = safeExternalUrl(settings.mapUrl);
  const social = [
    { label: "Instagram", href: safeExternalUrl(settings.instagramUrl) },
    { label: "Facebook", href: safeExternalUrl(settings.facebookUrl) },
  ].filter((s): s is { label: string; href: string } => Boolean(s.href));

  return (
    <>
      <PageHeader eyebrow={settings.name} title={t.title} intro={t.intro}>
        <div className="mt-8">
          <ContactActions settings={settings} />
        </div>
      </PageHeader>
      <Container className="grid gap-12 py-14 sm:py-20 lg:grid-cols-2 lg:gap-20">
        <dl className="border-b border-border/80">
          <Detail label={t.address}>
            <address className="not-italic">{settings.address ?? <span className="text-muted-foreground">{t.notProvided}</span>}</address>
            {map && (
              <a href={map} target="_blank" rel="noopener noreferrer" className={`${linkClass} mt-3 inline-flex items-center gap-2 text-base`}>
                <MapPinIcon className="size-4" aria-hidden />
                {t.map}
                <ExternalLinkIcon className="size-3.5" aria-hidden />
              </a>
            )}
          </Detail>
          <Detail label={t.phone}>
            {settings.phone ? tel ? <a className={linkClass} href={tel}>{settings.phone}</a> : settings.phone : <span className="text-muted-foreground">{t.notProvided}</span>}
          </Detail>
          <Detail label={t.email}>
            <span className="break-words">
              {settings.email ? mail ? <a className={linkClass} href={mail}>{settings.email}</a> : settings.email : <span className="text-muted-foreground">{t.notProvided}</span>}
            </span>
          </Detail>
          {wa && (
            <Detail label={t.whatsapp}>
              <a className={linkClass} href={wa} target="_blank" rel="noopener noreferrer">
                {settings.whatsapp}
              </a>
            </Detail>
          )}
          {social.length > 0 && (
            <Detail label={t.social}>
              <span className="flex flex-wrap gap-6">
                {social.map((s) => (
                  <a key={s.label} className={linkClass} href={s.href} target="_blank" rel="noopener noreferrer">
                    {s.label}
                  </a>
                ))}
              </span>
            </Detail>
          )}
        </dl>

        <section aria-labelledby="hours-title" className="self-start rounded-md bg-secondary p-7 sm:p-9">
          <h2 id="hours-title" className="mb-5 text-3xl">
            {t.hours}
          </h2>
          <OpeningHours rows={settings.openingHours} className="text-base" />
          {map && (
            <div className="mt-8">
              <LinkButton href={map} variant="outline">
                <MapPinIcon aria-hidden />
                {t.map}
              </LinkButton>
            </div>
          )}
        </section>
      </Container>
    </>
  );
}
