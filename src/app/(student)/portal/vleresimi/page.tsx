import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { EmptyState } from "@/components/portal/empty-state";
import { feedbackText } from "@/i18n/feedback";
import { formatWeekdayDate } from "@/lib/datetime";
import { requirePageUser } from "@/server/auth/session";
import { getStudentFeedback } from "@/server/queries/feedback";

const t = feedbackText.student;

export const metadata: Metadata = { title: t.metaTitle };

function Item({ title, subtitle, children }: { title: ReactNode; subtitle?: string | null; children: ReactNode }) {
  return (
    <li className="grid gap-3 rounded-xl border bg-card p-4 sm:p-5">
      <div>
        <h3 className="text-lg leading-tight">{title}</h3>
        {subtitle ? <p className="text-xs text-muted-foreground first-letter:uppercase">{subtitle}</p> : null}
      </div>
      {children}
    </li>
  );
}

export default async function FeedbackPage() {
  const user = await requirePageUser("student");
  const { lessons, courses } = await getStudentFeedback(user);

  return (
    <div className="grid max-w-3xl gap-10">
      <header>
        <h1 className="text-3xl sm:text-4xl">{t.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.intro}</p>
      </header>

      {courses.length > 0 ? (
        <section aria-labelledby="courses-heading" className="grid gap-3">
          <h2 id="courses-heading" className="text-2xl">
            {t.coursesTitle}
          </h2>
          <ul className="grid gap-3">
            {courses.map((course) => (
              <Item key={course.id} title={course.title}>
                <FeedbackForm target={{ topic: "COURSE", courseId: course.id }} saved={course.feedback} />
              </Item>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="lessons-heading" className="grid gap-3">
        <h2 id="lessons-heading" className="text-2xl">
          {t.lessonsTitle}
        </h2>
        {lessons.length ? (
          <ul className="grid gap-3">
            {lessons.map((lesson) => (
              <Item
                key={lesson.id}
                title={
                  <Link href={`/portal/mesimet/${lesson.id}`} className="underline-offset-4 hover:underline">
                    {lesson.title}
                  </Link>
                }
                subtitle={[formatWeekdayDate(lesson.startsAt), lesson.courseTitle].filter(Boolean).join(" · ")}
              >
                <FeedbackForm target={{ topic: "LESSON", lessonId: lesson.id }} saved={lesson.feedback} />
              </Item>
            ))}
          </ul>
        ) : (
          <EmptyState title={t.lessonsEmpty} />
        )}
      </section>

      <section aria-labelledby="app-heading" className="grid gap-3">
        <h2 id="app-heading" className="text-2xl">
          {t.appTitle}
        </h2>
        <p className="text-sm text-muted-foreground">{t.appIntro}</p>
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <FeedbackForm target={{ topic: "APP" }} />
        </div>
      </section>
    </div>
  );
}
