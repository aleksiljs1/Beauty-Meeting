"use client";

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Label + control + hint/error, wired for screen readers (aria-describedby / aria-invalid).
 * The single child must be the input element; it receives the generated id.
 */
export function FormField({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>;
  className?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children) ? cloneElement(children, { id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined }) : children;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {control}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
