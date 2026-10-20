import type { Metadata } from "next";
import { ContactActions } from "@/components/public/contact";
import { Container, PageHeader } from "@/components/public/primitives";
import { ServiceList } from "@/components/public/service-list";
import { publicSite } from "@/i18n/public";
import { getPublicServices, getPublicSettings } from "@/server/queries/public";

const t = publicSite.services;

export const metadata: Metadata = { title: t.title, description: t.description };

export default async function ServicesPage() {
  const [settings, services] = await Promise.all([getPublicSettings(), getPublicServices()]);
  return (
    <>
      <PageHeader eyebrow={settings.name} title={t.title} intro={t.intro}>
        <div className="mt-8">
          <ContactActions settings={settings} />
        </div>
      </PageHeader>
      <Container className="py-14 sm:py-20">
        <div className="max-w-4xl">
          <ServiceList services={services} />
        </div>
      </Container>
    </>
  );
}
