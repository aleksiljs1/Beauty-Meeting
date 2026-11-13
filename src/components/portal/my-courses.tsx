import { GraduationCap } from "lucide-react";
import Link from "next/link";
import { portalText } from "@/i18n/portal";
import { formatCalendarDate, formatWeekdayDate } from "@/lib/datetime";
import type { AppUser } from "@/server/auth/session";
import { getMyCourses } from "@/server/queries/my-courses";

const t = portalText.myCourses;

/** The student's courses: lessons done, classes attended, next lesson and what is paid. */
export async function MyCourses({ user }: { user: AppUser }) {
  const courses = await getMyCourses(user);
  if (!courses.length) return null;
  return (
    <section aria-labelledby="my-courses-heading" className="grid gap-3">
      <h2 id="my-courses-heading" className="text-2xl">
        {t.title}
      </h2>
      <ul className="grid gap-4 md:grid-cols-2">
        {courses.map((c) => {
          const progress = c.lessonsTotal ? Math.round((c.lessonsDone / c.lessonsTotal) * 100) : 0;
          return (
            <li key={c.id} className="grid gap-3 rounded-xl border bg-card p-5">
              <h3 className="flex items-center gap-2 text-xl">
                <GraduationCap aria-hidden className="size-5 shrink-0 text-rose-deep" /> {c.title}
              </h3>
              {c.lessonsTotal > 0 && (
                <div className="grid gap-1.5 text-sm">
                  <p>{t.lessons(c.lessonsDone, c.lessonsTotal)}</p>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div className="h-full rounded-full bg-gradient-to-r from-rose/70 to-rose-deep" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}
              <dl className="grid gap-1 text-sm">
                {c.available > 0 && (
                  <div className="flex flex-wrap gap-x-1.5">
                    <dt className="text-muted-foreground">{t.attendance}:</dt>
                    <dd>{t.attended(c.attended, c.available)}</dd>
                  </div>
                )}
                {c.nextLesson && (
                  <div className="flex flex-wrap gap-x-1.5">
                    <dt className="text-muted-foreground">{t.next}:</dt>
                    <dd>
                      <Link href={`/portal/mesimet/${c.nextLesson.id}`} className="underline-offset-4 hover:text-rose-deep hover:underline">
                        <span className="first-letter:uppercase">{formatWeekdayDate(c.nextLesson.scheduledStartAt)}</span> · {c.nextLesson.title}
                      </Link>
                    </dd>
                  </div>
                )}
                {c.billed && (
                  <div className="flex flex-wrap gap-x-1.5">
                    <dt className="text-muted-foreground">{t.paidUntil}:</dt>
                    <dd className={c.overdue ? "text-destructive" : undefined}>
                      {c.paidUntil ? formatCalendarDate(c.paidUntil) : t.nothingPaid}
                      {c.overdue ? ` · ${t.overdue}` : c.nextDueOn ? ` · ${t.nextDue(formatCalendarDate(c.nextDueOn))}` : ""}
                    </dd>
                  </div>
                )}
              </dl>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
