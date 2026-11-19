import { CheckCircle2 } from "lucide-react";
import { portalText } from "@/i18n/portal";
import { cn } from "@/lib/utils";

const t = portalText.offline;

/** How many of an offline lesson's materials the student has opened, as a bar and a sentence. */
export function StudyProgress({ seen, total, className, compact = false }: { seen: number; total: number; className?: string; compact?: boolean }) {
  const done = total > 0 && seen >= total;
  const share = total ? Math.min(1, seen / total) : 0;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className={cn("inline-flex items-center gap-1.5", done ? "font-medium text-rose-deep" : "text-muted-foreground")}>
          {done ? <CheckCircle2 aria-hidden="true" className="size-3.5" /> : null}
          {t.progress(seen, total)}
        </span>
        {total > 0 && !compact ? <span className="text-muted-foreground tabular-nums">{Math.round(share * 100)}%</span> : null}
      </div>
      {total > 0 ? (
        <div
          role="progressbar"
          aria-label={t.progressLabel}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={Math.min(seen, total)}
          aria-valuetext={t.progress(seen, total)}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div className={cn("h-full rounded-full transition-[width] duration-500", done ? "bg-rose-deep" : "bg-rose/70")} style={{ width: `${share * 100}%` }} />
        </div>
      ) : null}
    </div>
  );
}
