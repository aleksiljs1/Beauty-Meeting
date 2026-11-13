import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({ icon: Icon, title, children }: { icon?: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-card/50 px-6 py-10 text-center animate-rise">
      {Icon ? (
        <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-rose/12 text-rose-deep ring-1 ring-rose/25">
          <Icon className="size-5" />
        </span>
      ) : null}
      <p className="font-medium">{title}</p>
      {children ? <div className="max-w-md text-sm text-muted-foreground">{children}</div> : null}
    </div>
  );
}
