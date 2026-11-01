"use client";

import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * The small round "i" next to a field label: a tap or click opens a short explanation of the
 * field. A popover rather than a hover tooltip, so it works the same on phones.
 */
export function InfoTip({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Çfarë është: ${label}`}
          className={cn(
            // 16px icon; the ::after enlarges the tap area to 28px without moving the layout.
            "relative inline-grid size-4 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors after:absolute after:-inset-1.5 hover:text-foreground focus-visible:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-[state=open]:text-rose-deep",
            className,
          )}
        >
          <Info aria-hidden className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" collisionPadding={16} className="max-w-[calc(100vw-2rem)] text-xs leading-relaxed">
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** A field label with an optional "i" beside it. */
export function LabelRow({ children, info, infoLabel }: { children: ReactNode; info?: ReactNode; infoLabel: string }) {
  if (!info) return <>{children}</>;
  return (
    <div className="flex items-center gap-1.5">
      {children}
      <InfoTip label={infoLabel}>{info}</InfoTip>
    </div>
  );
}
