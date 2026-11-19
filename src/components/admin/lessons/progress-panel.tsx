import { EmptyState } from "@/components/admin/page-parts";
import { admin } from "@/i18n/admin";
import { formatDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { getLessonProgress } from "@/server/queries/admin";

const t = admin.progress;

/** Offline lessons: which students have opened how many of the materials. */
export function ProgressPanel({ progress }: { progress: Awaited<ReturnType<typeof getLessonProgress>> }) {
  const { total, students } = progress;
  if (!students.length) return <EmptyState>{t.empty}</EmptyState>;
  if (!total) return <EmptyState>{t.noMaterials}</EmptyState>;
  const done = students.filter((s) => s.seen >= total).length;
  const started = students.filter((s) => s.seen > 0).length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t.intro}</p>
      <p className="text-sm font-medium">{t.summary(done, started, students.length)}</p>
      <ul className="divide-y rounded-md border">
        {students.map((student) => {
          const finished = student.seen >= total;
          return (
            <li key={student.id} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center sm:gap-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{student.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {student.lastSeenAt ? t.lastSeen(formatDateTime(student.lastSeenAt)) : t.notStarted}
                </p>
              </div>
              <div className="grid gap-1">
                <div className="flex items-center justify-between text-xs">
                  <span className={cn(finished ? "font-medium text-rose-deep" : "text-muted-foreground")}>{finished ? t.done : t.count(student.seen, total)}</span>
                  <span className="text-muted-foreground tabular-nums">{Math.round((Math.min(student.seen, total) / total) * 100)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div className={cn("h-full rounded-full", finished ? "bg-rose-deep" : "bg-rose/70")} style={{ width: `${(Math.min(student.seen, total) / total) * 100}%` }} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
