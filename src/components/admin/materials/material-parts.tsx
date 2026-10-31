"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Download, Eye, FileText, Film, Loader2, Pencil } from "lucide-react";
import { FormField } from "@/components/admin/form-field";
import { formatBytes } from "@/components/admin/uploads";
import { errorMessage, useApiAction } from "@/components/admin/use-api-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiSend } from "@/lib/api/client";
import { admin } from "@/i18n/admin";
import { common } from "@/i18n/common";
import { ProtectedVideo, type VideoGrant } from "@/components/portal/protected-video";

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

type FileGrant = VideoGrant;

function previewKind(mimeType: string): "pdf" | "image" | "video" | null {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "video/mp4") return "video";
  return null;
}

function AdminMaterialVideo({ file, grant }: { file: FileInfo; grant: FileGrant }) {
  const requestGrant = useCallback(
    () => apiSend<FileGrant>("post", `/admin/library/${file.fileId}/access`, { mode: "view" }),
    [file.fileId],
  );
  return <ProtectedVideo requestGrant={requestGrant} initialGrant={grant} visible label={file.displayName} expiredMessage={t.previewExpired} />;
}

/** "Shiko": previews browser-supported materials in a dialog without leaving the page. */
export function OpenFileButton({ file }: { file: FileInfo }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [grant, setGrant] = useState<FileGrant | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (file.status !== "READY") return null;

  async function openPreview() {
    setOpen(true);
    setGrant(null);
    setError(null);
    setPending(true);
    try {
      setGrant(await apiSend<FileGrant>("post", `/admin/library/${file.fileId}/access`, { mode: "view" }));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  async function downloadFile() {
    setDownloading(true);
    setError(null);
    try {
      const grant = await apiSend<FileGrant>("post", `/admin/library/${file.fileId}/access`, { mode: "download" });
      window.location.assign(grant.url);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => void openPreview()} disabled={pending}>
        {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Eye aria-hidden />} {t.open}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-full min-w-0 sm:max-w-5xl">
          <DialogHeader className="min-w-0 pr-8">
            <DialogTitle className="truncate">{file.displayName}</DialogTitle>
            <DialogDescription>{t.previewDescription}</DialogDescription>
          </DialogHeader>
          {pending ? <div className="flex min-h-48 items-center justify-center"><Loader2 aria-label={common.actions.loading} className="size-8 animate-spin" /></div> : null}
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          {grant && previewKind(file.mimeType) === "video" ? <AdminMaterialVideo file={file} grant={grant} /> : null}
          {grant && previewKind(file.mimeType) === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={grant.url} alt={file.displayName} className="max-h-[70vh] w-full rounded-md border bg-muted object-contain" />
          ) : null}
          {grant && previewKind(file.mimeType) === "pdf" ? (
            <iframe src={grant.url} title={file.displayName} className="h-[70vh] min-h-96 w-full rounded-md border bg-muted" />
          ) : null}
          {grant && !previewKind(file.mimeType) ? (
            <div className="grid justify-items-center gap-3 rounded-md border bg-muted/30 p-8 text-center">
              <p className="text-sm text-muted-foreground">{t.previewUnsupported}</p>
            </div>
          ) : null}
          {grant ? (
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => void downloadFile()} disabled={downloading}>
                {downloading ? <Loader2 aria-hidden className="animate-spin" /> : <Download aria-hidden />}
                {t.download}
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
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
