import { Star } from "lucide-react";
import { feedbackText } from "@/i18n/feedback";
import { cn } from "@/lib/utils";

const t = feedbackText;

/** Read-only star rating; `value` may be an average (rounded to the nearest star). */
export function Stars({ value, className }: { value: number; className?: string }) {
  const filled = Math.round(value);
  return (
    <span role="img" aria-label={t.admin.average(value)} className={cn("inline-flex gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} aria-hidden className={cn("size-4", n <= filled ? "fill-rose text-rose" : "text-muted-foreground/50")} />
      ))}
    </span>
  );
}

/** "★★★★☆ 4,2 nga 5 · 6 vlerësime", or "Pa vlerësime". */
export function RatingSummary({ average, count }: { average: number | null; count: number }) {
  if (average === null) return <span className="text-sm text-muted-foreground">{t.admin.noRatings}</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 text-sm">
      <Stars value={average} />
      <span className="tabular-nums">{t.admin.average(average)}</span>
      <span className="text-muted-foreground">· {t.admin.ratingCount(count)}</span>
    </span>
  );
}
