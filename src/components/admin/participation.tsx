import { cn } from "@/lib/utils";

/** Below this share of classes attended, the bar turns red. */
export const LOW_ATTENDANCE = 60;

/** Attendance as a short bar plus the number (the number carries the meaning; the bar is a glance). */
export function RateBar({ rate, label, className }: { rate: number; label?: string; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span aria-hidden className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-muted">
        <span className={cn("block h-full rounded-full", rate < LOW_ATTENDANCE ? "bg-destructive" : "bg-rose")} style={{ width: `${rate}%` }} />
      </span>
      <span className="tabular-nums">{label ?? `${rate}%`}</span>
    </span>
  );
}
