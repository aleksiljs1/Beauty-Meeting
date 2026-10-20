"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, FileText, Pencil, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { FormField } from "@/components/admin/form-field";
import { EmptyState } from "@/components/admin/page-parts";
import { formatBytes, putToPresignedUrl } from "@/components/admin/uploads";
import { errorMessage, useApiAction } from "@/components/admin/use-api-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiClientError, apiSend } from "@/lib/api/client";
import { admin } from "@/i18n/admin";
import { common } from "@/i18n/common";

const t = admin.materials;

export type MaterialRow = { id: string; displayName: string; mimeType: string; sizeBytes: number; status: "PENDING" | "READY" | "FAILED" };

/** Browsers sometimes report an empty type for Office files; fall back to the extension. */
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};
const ACCEPT = Object.keys(MIME_BY_EXTENSION)
  .map((ext) => `.${ext}`)
  .join(",");

function mimeOf(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return file.type || MIME_BY_EXTENSION[ext] || "application/octet-stream";
}

type Progress = { name: string; loaded: number; total: number; phase: "upload" | "verify" };

export function MaterialsPanel({ lessonId, materials }: { lessonId: string; materials: MaterialRow[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<Progress | null>(null);

  async function upload(file: File) {
    setProgress({ name: file.name, loaded: 0, total: file.size, phase: "upload" });
    let materialId: string | null = null;
    try {
      const started = await apiSend<{ materialId: string; uploadUrl: string; headers: Record<string, string> }>("post", `/admin/lessons/${lessonId}/materials`, {
        filename: file.name,
        mimeType: mimeOf(file),
        sizeBytes: file.size,
      });
      materialId = started.materialId;
      await putToPresignedUrl(started.uploadUrl, file, {
        headers: started.headers,
        onProgress: (loaded) => setProgress((p) => (p ? { ...p, loaded } : p)),
      });
      setProgress((p) => (p ? { ...p, loaded: p.total, phase: "verify" } : p));
      await apiSend("post", `/admin/materials/${materialId}/finish`);
      toast.success(t.uploaded);
    } catch (error) {
      // A failed transfer leaves nothing useful behind: remove the pending record.
      if (materialId && !(error instanceof ApiClientError)) await apiSend("delete", `/admin/materials/${materialId}`).catch(() => undefined);
      toast.error(error instanceof ApiClientError ? errorMessage(error) : t.uploadFailed);
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
      router.refresh();
    }
  }

  const percent = progress && progress.total ? Math.round((progress.loaded / progress.total) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">{t.intro}</p>
        <div>
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            id="material-file"
            tabIndex={-1}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <Button onClick={() => input.current?.click()} disabled={!!progress}>
            <Upload aria-hidden /> {t.choose}
          </Button>
        </div>
      </div>

      <div aria-live="polite">
        {progress && (
          <div className="space-y-2 rounded-md border p-3 text-sm">
            <p>{progress.phase === "verify" ? t.verifying : t.uploading(progress.name)}</p>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label={t.uploading(progress.name)}
            >
              <div className="h-full bg-rose-deep transition-[width]" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {formatBytes(progress.loaded)} / {formatBytes(progress.total)} · {percent}%
            </p>
          </div>
        )}
      </div>

      {materials.length === 0 ? (
        <EmptyState>{t.empty}</EmptyState>
      ) : (
        <ul className="divide-y rounded-md border">
          {materials.map((material, index) => (
            <MaterialItem key={material.id} material={material} first={index === 0} last={index === materials.length - 1} />
          ))}
        </ul>
      )}
    </div>
  );
}

function MaterialItem({ material, first, last }: { material: MaterialRow; first: boolean; last: boolean }) {
  const { run, pending } = useApiAction();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(material.displayName);
  const url = `/admin/materials/${material.id}`;

  async function open() {
    // Open the tab synchronously (popup blockers), then point it at the short-lived URL.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    const grant = await run(() => apiSend<{ url: string }>("post", `${url}/access`), { refresh: false });
    if (grant && tab) tab.location.href = grant.url;
    else tab?.close();
  }

  async function rename(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const done = await run(() => apiSend("patch", url, { displayName: name.trim() }), { success: t.renamed });
    if (done) setRenaming(false);
  }

  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="truncate font-medium">{material.displayName}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{formatBytes(material.sizeBytes)}</span>
            <Badge variant={material.status === "READY" ? "outline" : material.status === "FAILED" ? "destructive" : "secondary"}>{t.status[material.status]}</Badge>
          </div>
          {material.status === "PENDING" && <p className="text-xs text-muted-foreground">{t.pendingHint}</p>}
          {material.status === "FAILED" && <p className="text-xs text-destructive">{t.failedHint}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1 self-start sm:self-center">
        {material.status === "READY" && (
          <Button variant="ghost" size="sm" onClick={open} disabled={pending}>
            <ExternalLink aria-hidden /> {t.open}
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" aria-label={`${t.moveUp}: ${material.displayName}`} disabled={pending || first} onClick={() => run(() => apiSend("patch", url, { move: "up" }))}>
          <ArrowUp aria-hidden />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={`${t.moveDown}: ${material.displayName}`} disabled={pending || last} onClick={() => run(() => apiSend("patch", url, { move: "down" }))}>
          <ArrowDown aria-hidden />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={`${t.rename}: ${material.displayName}`} disabled={pending} onClick={() => setRenaming(true)}>
          <Pencil aria-hidden />
        </Button>
        <ConfirmAction
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={`${common.actions.delete}: ${material.displayName}`} disabled={pending}>
              <Trash2 aria-hidden className="text-destructive" />
            </Button>
          }
          title={t.deleteTitle}
          description={t.deleteBody(material.displayName)}
          confirmLabel={common.actions.delete}
          destructive
          onConfirm={() => run(() => apiSend("delete", url), { success: t.deleted })}
        />
      </div>

      <Dialog
        open={renaming}
        onOpenChange={(next) => {
          setRenaming(next);
          if (next) setName(material.displayName);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.renameTitle}</DialogTitle>
          </DialogHeader>
          <form onSubmit={rename} className="space-y-4">
            <FormField label={t.renameField}>
              <Input value={name} maxLength={150} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenaming(false)}>
                {common.actions.cancel}
              </Button>
              <Button type="submit" disabled={pending || !name.trim()}>
                {common.actions.save}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </li>
  );
}
