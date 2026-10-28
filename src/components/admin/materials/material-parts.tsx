"use client";

import { useState, type ReactNode } from "react";
import { ExternalLink, FileText, Film, Pencil } from "lucide-react";
import { FormField } from "@/components/admin/form-field";
import { formatBytes } from "@/components/admin/uploads";
import { useApiAction } from "@/components/admin/use-api-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiSend } from "@/lib/api/client";
import { admin } from "@/i18n/admin";
import { common } from "@/i18n/common";

/** Pieces shared by a lesson's material list and the materials library. */

const t = admin.materials;

export type FileInfo = { fileId: string; displayName: string; mimeType: string; sizeBytes: number; status: "PENDING" | "READY" | "FAILED" };

/** Icon, name, size and state of a file, with `extra` lines underneath. */
export function FileSummary({ file, extra }: { file: FileInfo; extra?: ReactNode }) {
  const Icon = file.mimeType.startsWith("video/") ? Film : FileText;
  return (
    <div className="flex min-w-0 gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className="truncate font-medium">{file.displayName}</p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{formatBytes(file.sizeBytes)}</span>
          <Badge variant={file.status === "READY" ? "outline" : file.status === "FAILED" ? "destructive" : "secondary"}>{t.status[file.status]}</Badge>
        </div>
        {file.status === "PENDING" && <p className="text-xs text-muted-foreground">{t.pendingHint}</p>}
        {file.status === "FAILED" && <p className="text-xs text-destructive">{t.failedHint}</p>}
        {extra}
      </div>
    </div>
  );
}

/** "Shiko": opens a short-lived preview of a ready file in a new tab. */
export function OpenFileButton({ file }: { file: FileInfo }) {
  const { run, pending } = useApiAction();
  if (file.status !== "READY") return null;

  async function open() {
    // Open the tab synchronously (popup blockers), then point it at the short-lived URL.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    const grant = await run(() => apiSend<{ url: string }>("post", `/admin/library/${file.fileId}/access`), { refresh: false });
    if (grant && tab) tab.location.href = grant.url;
    else tab?.close();
  }

  return (
    <Button variant="ghost" size="sm" onClick={open} disabled={pending}>
      <ExternalLink aria-hidden /> {t.open}
    </Button>
  );
}

/** Renames the library file, so the new name shows in every lesson that uses it. */
export function RenameFileButton({ file }: { file: FileInfo }) {
  const { run, pending } = useApiAction();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(file.displayName);

  async function rename(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const done = await run(() => apiSend("patch", `/admin/library/${file.fileId}`, { displayName: name.trim() }), { success: t.renamed });
    if (done) setOpen(false);
  }

  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label={`${t.rename}: ${file.displayName}`} disabled={pending} onClick={() => setOpen(true)}>
        <Pencil aria-hidden />
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setName(file.displayName);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.renameTitle}</DialogTitle>
          </DialogHeader>
          <form onSubmit={rename} className="space-y-4">
            <FormField label={t.renameField} hint={t.renameHint}>
              <Input value={name} maxLength={150} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {common.actions.cancel}
              </Button>
              <Button type="submit" disabled={pending || !name.trim()}>
                {common.actions.save}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
