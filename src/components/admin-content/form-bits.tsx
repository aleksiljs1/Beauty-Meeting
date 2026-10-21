"use client";

import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { adminContent } from "@/i18n/admin-content";
import { common } from "@/i18n/common";
import { ApiClientError } from "@/lib/api/client";
import { cn } from "@/lib/utils";

/** Accessible field wrapper: label, control, hint and error wired with aria-describedby. */
export function Field({
  id,
  label,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: (aria: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
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

/** Polite live region for save/upload status. */
export function StatusMessage({ status }: { status: { kind: "idle" | "busy" | "ok" | "error"; text?: string } }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className={cn("min-h-5 text-sm", status.kind === "error" ? "text-destructive" : status.kind === "ok" ? "text-foreground" : "text-muted-foreground")}
    >
      {status.text}
    </p>
  );
}

export type Status = { kind: "idle" | "busy" | "ok" | "error"; text?: string };

export function errorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.message : common.errors.generic;
}

/** Copies server-side field issues (Zod paths) onto the form, so they show next to the inputs. */
export function applyFieldIssues<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>) {
  if (!(error instanceof ApiClientError)) return;
  for (const issue of error.issues) {
    if (issue.path) setError(issue.path as Path<T>, { type: "server", message: issue.message });
  }
}

export function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function OrderButtons({
  index,
  count,
  label,
  disabled,
  onMove,
}: {
  index: number;
  count: number;
  label: string;
  disabled?: boolean;
  onMove: (delta: -1 | 1) => void;
}) {
  return (
    <div className="flex gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled || index === 0}
        onClick={() => onMove(-1)}
        aria-label={`${adminContent.order.up}: ${label}`}
      >
        <ArrowUpIcon aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled || index === count - 1}
        onClick={() => onMove(1)}
        aria-label={`${adminContent.order.down}: ${label}`}
      >
        <ArrowDownIcon aria-hidden />
      </Button>
    </div>
  );
}

export function PublishedBadge({ published }: { published: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium",
        published ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      {published ? adminContent.status.published : adminContent.status.hidden}
    </span>
  );
}
