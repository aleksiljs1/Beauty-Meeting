import { Badge } from "@/components/ui/badge";
import { common } from "@/i18n/common";
import { cn } from "@/lib/utils";
import type { LessonPhase } from "@/server/access/policy";

const STYLES: Record<LessonPhase, string> = {
  UPCOMING: "bg-secondary text-secondary-foreground",
  STARTING_SOON: "bg-accent text-accent-foreground",
  WAITING_FOR_HOST: "bg-accent text-accent-foreground",
  LIVE: "bg-live text-white",
  REPLAY: "border-rose/40 bg-card text-rose-deep",
  ENDED: "bg-muted text-muted-foreground",
  EXPIRED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-muted text-muted-foreground line-through decoration-1",
};

/** Lesson phase label. LIVE comes from stored meeting state only — never from the clock. */
export function PhaseBadge({ phase, className }: { phase: LessonPhase; className?: string }) {
  return (
    <Badge className={cn("h-6 px-2.5", STYLES[phase], className)}>
      {phase === "LIVE" ? <span aria-hidden="true" className="size-1.5 rounded-full bg-white motion-safe:animate-pulse" /> : null}
      {common.lessonPhase[phase]}
    </Badge>
  );
}
