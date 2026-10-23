import { FileTextIcon, PlayCircleIcon, VideoIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ContactActions } from "@/components/public/contact";
import { CourseCard } from "@/components/public/course-card";
import { ArrowLink, Container, Eyebrow, GalleryImage, ImagePlaceholder, LinkButton, monogramOf, SectionHeading } from "@/components/public/primitives";
import { ServiceList } from "@/components/public/service-list";
import { publicSite } from "@/i18n/public";
import { getPublicCourses, getPublicGallery, getPublicServices, getPublicSettings } from "@/server/queries/public";

const t = publicSite.home;

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicSettings();
  // Absolute title: the home page is the brand itself.
  return { title: { absolute: settings.tagline ? `${settings.name} — ${settings.tagline}` : settings.name } };
}

const onlineIcons = [VideoIcon, FileTextIcon, PlayCircleIcon];

export default async function HomePage() {
  const [settings, services, courses, heroImages, selected] = await Promise.all([
    getPublicSettings(),
    getPublicServices(),
    getPublicCourses(),
    getPublicGallery(1, "showOnHomeHero"),
    getPublicGallery(6, "showOnHomeGallery"),
  ]);
  const heroImage = heroImages[0];

  return (
    <>
      {/* Hero ------------------------------------------------------------------------------ */}
      <section aria-labelledby="hero-title">
        <Container className="grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:py-24">
          <div>
            <Eyebrow className="mb-5">{t.eyebrow}</Eyebrow>
            <h1 id="hero-title" className="text-5xl leading-[1.02] sm:text-6xl lg:text-7xl">
              {settings.name}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl">{settings.tagline ?? t.heroFallback}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <LinkButton href="/akademia">{t.heroCtaCourses}</LinkButton>
              <LinkButton href="/kontakt" variant="outline">
                {t.heroCtaContact}
              </LinkButton>
            </div>
          </div>
          {heroImage ? (
            <GalleryImage item={heroImage} preload sizes="(min-width: 1024px) 42vw, 100vw" className="aspect-[4/5] max-h-[38rem] w-full" />
          ) : (
            <ImagePlaceholder monogram={monogramOf(settings.name)} className="aspect-[4/5] max-h-[38rem] w-full" />
          )}
        </Container>
      </section>

      {/* Services -------------------------------------------------------------------------- */}
      <section aria-labelledby="services-title" className="border-t border-border/70">
        <Container className="py-16 sm:py-24">
          <SectionHeading
            id="services-title"
            eyebrow={t.servicesEyebrow}
            title={t.servicesTitle}
            action={services.length > 0 ? <ArrowLink href="/sherbimet">{t.servicesAll}</ArrowLink> : undefined}
          />
          <ServiceList services={services.slice(0, 6)} compact />
        </Container>
      </section>

      {/* Academy --------------------------------------------------------------------------- */}
      <section aria-labelledby="academy-title" className="bg-secondary">
        <Container className="py-16 sm:py-24">
          <SectionHeading
            id="academy-title"
            eyebrow={t.academyEyebrow}
            title={t.academyTitle}
            intro={t.academyIntro}
            action={courses.length > 0 ? <ArrowLink href="/akademia">{t.academyAll}</ArrowLink> : undefined}
          />
          {courses.length > 0 ? (
            <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {courses.slice(0, 3).map((course) => (
                <li key={course.slug}>
                  <CourseCard course={course} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">{publicSite.academy.empty}</p>
          )}
        </Container>
      </section>

      {/* Online learning ------------------------------------------------------------------- */}
      <section aria-labelledby="online-title">
        <Container className="grid gap-12 py-16 sm:py-24 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <div>
            <Eyebrow className="mb-3">{t.onlineEyebrow}</Eyebrow>
            <h2 id="online-title" className="text-3xl leading-tight sm:text-4xl">
              {t.onlineTitle}
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">{t.onlineIntro}</p>
            <div className="mt-8">
              <LinkButton href="/hyr" variant="outline">
                {t.onlineCta}
              </LinkButton>
            </div>
          </div>
          <ol className="divide-y divide-border/80 border-y border-border/80">
            {t.onlineFeatures.map((feature, index) => {
              const Icon = onlineIcons[index] ?? VideoIcon;
              return (
                <li key={feature.title} className="flex gap-5 py-7">
                  <span className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-rose-deep">
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-2xl">{feature.title}</h3>
                    <p className="mt-2 leading-relaxed text-muted-foreground">{feature.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </Container>
      </section>

      {/* Gallery --------------------------------------------------------------------------- */}
      <section aria-labelledby="gallery-title" className="border-t border-border/70">
        <Container className="py-16 sm:py-24">
          <SectionHeading
            id="gallery-title"
            eyebrow={t.galleryEyebrow}
            title={t.galleryTitle}
            action={selected.length > 0 ? <ArrowLink href="/galeria">{t.galleryAll}</ArrowLink> : undefined}
          />
          {selected.length > 0 ? (
            <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
              {selected.map((item) => (
                <li key={item.id}>
                  <Link href="/galeria" className="block rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none">
                    <GalleryImage item={item} sizes="(min-width: 768px) 33vw, 50vw" className="aspect-square" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <ImagePlaceholder className="aspect-[3/1] min-h-48 w-full" />
          )}
        </Container>
      </section>

      {/* Contact CTA ----------------------------------------------------------------------- */}
      <section aria-labelledby="cta-title" className="bg-sand">
        <Container className="flex flex-col gap-8 py-16 sm:py-20 md:flex-row md:items-end md:justify-between">
          <div className="max-w-xl">
            <h2 id="cta-title" className="text-3xl leading-tight sm:text-4xl">
              {t.contactTitle}
            </h2>
            <p className="mt-4 leading-relaxed text-foreground/75">{t.contactBody}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ContactActions settings={settings} />
            <LinkButton href="/kontakt" variant="outline">
              {t.contactCta}
            </LinkButton>
          </div>
        </Container>
      </section>
    </>
  );
}
