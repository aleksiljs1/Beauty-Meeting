import type { Metadata } from "next";
import { CourseCard } from "@/components/public/course-card";
import { Container, EmptyState, PageHeader } from "@/components/public/primitives";
import { Reveal } from "@/components/public/reveal";
import { publicSite } from "@/i18n/public";
import { getPublicCourses, getPublicSettings } from "@/server/queries/public";

const t = publicSite.academy;

export const metadata: Metadata = { title: t.title, description: t.description };

export default async function AcademyPage() {
  const [settings, courses] = await Promise.all([getPublicSettings(), getPublicCourses()]);
  return (
    <>
      <PageHeader eyebrow={settings.name} title={t.title} intro={t.intro} />
      <Container className="py-14 sm:py-20">
        {courses.length > 0 ? (
          <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {courses.map((course, index) => (
              <Reveal as="li" key={course.slug} delay={(index % 3) * 90}>
                <CourseCard course={course} />
              </Reveal>
            ))}
          </ul>
        ) : (
          <EmptyState>{t.empty}</EmptyState>
        )}
      </Container>
    </>
  );
}
