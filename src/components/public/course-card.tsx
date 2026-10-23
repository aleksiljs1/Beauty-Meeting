import Link from "next/link";
import { publicSite } from "@/i18n/public";
import type { PublicCourse } from "@/server/queries/public";

const t = publicSite.academy;

export function CourseMeta({ course, className }: { course: Pick<PublicCourse, "durationText" | "priceText">; className?: string }) {
  if (!course.durationText && !course.priceText) return null;
  return (
    <dl className={className ?? "flex flex-wrap gap-x-8 gap-y-2 text-sm"}>
      {course.durationText && (
        <div>
          <dt className="text-xs tracking-[0.14em] text-muted-foreground uppercase">{t.duration}</dt>
          <dd className="mt-1">{course.durationText}</dd>
        </div>
      )}
      {course.priceText && (
        <div>
          <dt className="text-xs tracking-[0.14em] text-muted-foreground uppercase">{t.price}</dt>
          <dd className="mt-1">{course.priceText}</dd>
        </div>
      )}
    </dl>
  );
}

/**
 * Whole card is one link (the title), with the rest as supporting text. On hover or keyboard
 * focus the border warms to gold, the card lifts slightly and the arrow moves forward.
 */
export function CourseCard({ course }: { course: PublicCourse }) {
  return (
    <article className="group relative flex h-full flex-col rounded-md border border-border bg-background p-7 transition-[border-color,box-shadow,translate] duration-300 ease-out hover:border-rose/60 hover:shadow-[0_18px_40px_-24px_rgb(0_0_0/0.9)] has-[:focus-visible]:border-rose/60 motion-safe:hover:-translate-y-1 motion-safe:has-[:focus-visible]:-translate-y-1">
      <h3 className="text-[1.7rem] leading-snug transition-colors duration-300 group-hover:text-rose-deep">
        <Link
          href={`/akademia/${course.slug}`}
          className="rounded-sm after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          {course.title}
        </Link>
      </h3>
      {course.summary && <p className="mt-3 leading-relaxed text-muted-foreground">{course.summary}</p>}
      <div className="mt-auto pt-7">
        <CourseMeta course={course} />
        <p className="mt-6 flex items-center gap-2 text-sm font-medium text-foreground" aria-hidden>
          <span className="underline decoration-rose/60 underline-offset-[6px] transition-[text-decoration-color] duration-300 group-hover:decoration-rose-deep">{t.details}</span>
          <span className="transition-transform duration-300 ease-out motion-safe:group-hover:translate-x-1 motion-safe:group-has-[:focus-visible]:translate-x-1">→</span>
        </p>
      </div>
    </article>
  );
}
