import type { Metadata } from "next";
import { ContactActions } from "@/components/public/contact";
import { Container, GalleryImage, LinkButton, PageHeader } from "@/components/public/primitives";
import { publicSite } from "@/i18n/public";
import { paragraphs } from "@/lib/public-content";
import { getPublicGallery, getPublicSettings } from "@/server/queries/public";

const t = publicSite.about;

export const metadata: Metadata = { title: t.title, description: t.description };

export default async function AboutPage() {
  const [settings, gallery] = await Promise.all([getPublicSettings(), getPublicGallery(1, "showOnAbout")]);
  const text = paragraphs(settings.about);
  const image = gallery[0];

  return (
    <>
      <PageHeader eyebrow={settings.name} title={t.title} intro={settings.tagline} />
      <Container className="grid gap-12 py-14 sm:py-20 lg:grid-cols-[1.2fr_0.8fr] lg:gap-20">
        <div className="max-w-2xl space-y-6 text-lg leading-relaxed text-foreground/85">
          {text.length > 0 ? text.map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>) : <p className="text-muted-foreground">{t.empty}</p>}
          <div className="flex flex-wrap gap-3 pt-6">
            <ContactActions settings={settings} />
            <LinkButton href="/kontakt" variant="outline">
              {publicSite.nav.contact}
            </LinkButton>
          </div>
        </div>
        {image && <GalleryImage item={image} sizes="(min-width: 1024px) 35vw, 100vw" className="aspect-[4/5] w-full self-start" />}
      </Container>
    </>
  );
}
