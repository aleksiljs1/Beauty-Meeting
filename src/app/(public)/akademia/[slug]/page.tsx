import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContactActions } from "@/components/public/contact";
import { CourseMeta } from "@/components/public/course-card";
import { Container, Eyebrow, LinkButton } from "@/components/public/primitives";
import { publicSite } from "@/i18n/public";
import { paragraphs } from "@/lib/public-content";
import { getPublicCourse, getPublicCourses, getPublicSettings } from "@/server/queries/public";

const t = publicSite.academy;

// Public courses are prerendered; a course published later renders on first visit and is
// cached (dynamicParams defaults to true). Admin changes revalidate both.
export async function generateStaticParams() {
  const courses = await getPublicCourses();
  return courses.map((course) => ({ slug: course.slug }));
}

export async function generateMetadata({ params }: PageProps<"/akademia/[slug]">): Promise<Metadata> {
  const course = await getPublicCourse((await params).slug);
  if (!course) return { title: t.notFoundTitle };
  return { title: course.title, description: course.summary ?? undefined };
}

export default async function CoursePage({ params }: PageProps<"/akademia/[slug]">) {
  const { slug } = await params;
  const [course, settings] = await Promise.all([getPublicCourse(slug), getPublicSettings()]);
  if (!course) notFound();
  const body = paragraphs(course.description);

  return (
    <article>
      <header className="border-b border-border/70">
        <Container className="py-14 sm:py-20">
          <p className="mb-8 text-sm text-muted-foreground">
            <Link
              href="/akademia"
              className="group inline-flex items-center gap-1.5 rounded-sm transition-colors duration-300 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span aria-hidden className="transition-transform duration-300 ease-out motion-safe:group-hover:-translate-x-1">
                ←
              </span>
              {t.backToCourses}
            </Link>
          </p>
          <Eyebrow className="mb-4">{t.title}</Eyebrow>
          <h1 className="max-w-3xl text-4xl leading-[1.1] sm:text-5xl">{course.title}</h1>
          {course.summary && <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">{course.summary}</p>}
          <CourseMeta course={course} className="mt-8 flex flex-wrap gap-x-12 gap-y-3 text-base" />
        </Container>
      </header>

      <Container className="grid gap-12 py-14 sm:py-20 lg:grid-cols-[1.3fr_0.7fr] lg:gap-20">
        <div className="max-w-2xl space-y-6 text-lg leading-relaxed text-foreground/85">
          {body.length > 0 ? body.map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>) : <p className="text-muted-foreground">{t.enquiryBody}</p>}
        </div>

        <aside aria-labelledby="enquiry-title" className="self-start rounded-md border border-border bg-secondary/70 p-7 lg:sticky lg:top-28">
          <h2 id="enquiry-title" className="text-2xl leading-snug">
            {t.enquiryTitle}
          </h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">{t.enquiryBody}</p>
          <div className="mt-6 flex flex-col gap-3 [&>div]:flex-col [&_a]:w-full">
            <ContactActions
              settings={settings}
              whatsappText={t.enquiryMessage(course.title)}
              emailSubject={t.enquiryEmailSubject(course.title)}
              labels={{ whatsapp: t.enquiryWhatsapp, phone: t.enquiryPhone, email: t.enquiryEmail }}
            />
            <LinkButton href="/kontakt" variant="outline" className="w-full">
              {t.enquiryContactPage}
            </LinkButton>
          </div>
        </aside>
      </Container>
    </article>
  );
}
