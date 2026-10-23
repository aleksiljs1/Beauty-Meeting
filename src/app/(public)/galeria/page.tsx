import type { Metadata } from "next";
import { Container, GalleryImage, ImagePlaceholder, PageHeader } from "@/components/public/primitives";
import { Reveal } from "@/components/public/reveal";
import { publicSite } from "@/i18n/public";
import { getPublicGallery, getPublicSettings } from "@/server/queries/public";

const t = publicSite.gallery;

export const metadata: Metadata = { title: t.title, description: t.description };

export default async function GalleryPage() {
  const [settings, gallery] = await Promise.all([getPublicSettings(), getPublicGallery()]);
  return (
    <>
      <PageHeader eyebrow={settings.name} title={t.title} intro={t.intro} />
      <Container className="py-14 sm:py-20">
        {gallery.length > 0 ? (
          // CSS columns keep each photo's own proportions (when known) in a calm masonry layout.
          <ul className="columns-1 gap-4 min-[480px]:columns-2 lg:columns-3">
            {gallery.map((item, index) => (
              <Reveal as="li" key={item.id} delay={(index % 3) * 80} className="mb-4 break-inside-avoid">
                <figure className="group">
                  <GalleryImage
                    item={item}
                    preload={index < 2}
                    sizes="(min-width: 1024px) 33vw, (min-width: 480px) 50vw, 100vw"
                    className="w-full"
                    aspect={item.width && item.height ? `${item.width} / ${item.height}` : "4 / 5"}
                  />
                  {item.caption && (
                    <figcaption className="mt-2 text-sm leading-relaxed text-muted-foreground transition-colors duration-300 group-hover:text-foreground">
                      {item.caption}
                    </figcaption>
                  )}
                </figure>
              </Reveal>
            ))}
          </ul>
        ) : (
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <ImagePlaceholder className="aspect-[4/3] w-full" />
            <div className="hidden flex-col justify-center rounded-md border border-dashed border-border px-8 sm:flex">
              <p className="text-muted-foreground">{t.empty}</p>
            </div>
            <p className="text-muted-foreground sm:hidden">{t.empty}</p>
          </div>
        )}
      </Container>
    </>
  );
}
