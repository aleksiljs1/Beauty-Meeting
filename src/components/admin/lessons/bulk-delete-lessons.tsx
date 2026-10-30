"use client";

import { useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { useApiAction } from "@/components/admin/use-api-action";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { PublicationStatus } from "@/generated/prisma/enums";
import { apiSend } from "@/lib/api/client";
import { admin } from "@/i18n/admin";
import { common } from "@/i18n/common";

const t = admin.lessons.bulkDelete;

type Scope = "drafts" | "all";

/** "Delete lessons" on the lessons list: only the drafts, or every lesson, matching its filters. */
export function BulkDeleteLessons({
  filter,
  counts,
}: {
  filter: { publication?: PublicationStatus; when?: "upcoming" | "past" };
  counts: { drafts: number; all: number };
}) {
  const [confirm, setConfirm] = useState<Scope | null>(null);
  const { run, pending } = useApiAction();
  if (!counts.all) return null;

  async function remove(scope: Scope) {
    const query = new URLSearchParams({ scope });
    if (filter.publication) query.set("publication", filter.publication);
    if (filter.when) query.set("when", filter.when);
    const result = await run(() => apiSend<{ count: number; skipped: number }>("delete", `/admin/lessons?${query}`));
    if (result) (result.skipped ? toast.warning : toast.success)(t.done(result.count, result.skipped));
  }

  const filtered = !!filter.publication || !!filter.when;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={pending}>
            <Trash2 aria-hidden /> {t.trigger} <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-w-72">
          {filtered && (
            <>
              <DropdownMenuLabel className="font-normal text-muted-foreground">{t.filtered}</DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem disabled={!counts.drafts} onSelect={() => setConfirm("drafts")}>
            {t.drafts(counts.drafts)}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("all")}>
            {t.all(counts.all)}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmAction
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm === "all" ? t.allTitle : t.draftsTitle}
        description={confirm === "all" ? t.allBody(counts.all) : t.draftsBody(counts.drafts)}
        confirmLabel={common.actions.delete}
        destructive
        onConfirm={() => remove(confirm!)}
      />
    </>
  );
}
