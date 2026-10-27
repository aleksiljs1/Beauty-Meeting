"use client";

import { useId, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { admin } from "@/i18n/admin";

export type CheckListItem = { id: string; label: string; description?: string; note?: ReactNode };

/** A scrollable list of checkboxes (courses, students), with optional "all / none" shortcuts. */
export function CheckList({
  legend,
  items,
  selected,
  onChange,
  shortcuts = false,
  footer,
}: {
  legend: ReactNode;
  items: CheckListItem[];
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  shortcuts?: boolean;
  footer?: ReactNode;
}) {
  const id = useId();
  const toggle = (itemId: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(itemId);
    else next.delete(itemId);
    onChange(next);
  };

  return (
    <fieldset className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <legend className="text-sm font-medium">{legend}</legend>
        {shortcuts && items.length > 1 && (
          <div className="flex gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(new Set(items.map((i) => i.id)))}>
              {admin.roster.course.selectAll}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(new Set())}>
              {admin.roster.course.selectNone}
            </Button>
          </div>
        )}
      </div>
      <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
        {items.map((item) => {
          const inputId = `${id}-${item.id}`;
          return (
            <li key={item.id}>
              <label htmlFor={inputId} className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-muted/50">
                <Checkbox id={inputId} className="mt-0.5" checked={selected.has(item.id)} onCheckedChange={(checked) => toggle(item.id, checked === true)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.label}</span>
                  {item.description && <span className="block truncate text-xs text-muted-foreground">{item.description}</span>}
                </span>
                {item.note && <span className="shrink-0 text-xs text-muted-foreground">{item.note}</span>}
              </label>
            </li>
          );
        })}
      </ul>
      {footer}
    </fieldset>
  );
}
