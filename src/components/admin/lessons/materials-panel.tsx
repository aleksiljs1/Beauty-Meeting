"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, ExternalLink, FileText, Film, Pencil, Trash2, Upload, X, XCircle } from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { FormField } from "@/components/admin/form-field";
import { EmptyState } from "@/components/admin/page-parts";
import { formatBytes, putToPresignedUrl, UploadAbortedError, uploadParts } from "@/components/admin/uploads";
import { errorMessage, useApiAction } from "@/components/admin/use-api-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiClientError, apiSend } from "@/lib/api/client";
import { prepareMaterialFile, summarizeUploads, type UploadItemStatus } from "@/lib/admin/material-uploads";
import { cn } from "@/lib/utils";
import { admin } from "@/i18n/admin";
import { common } from "@/i18n/common";
import { acceptedExtensions } from "@/server/storage/file-types";

const t = admin.materials;

export type MaterialRow = { id: string; displayName: string; mimeType: string; sizeBytes: number; status: "PENDING" | "READY" | "FAILED" };

const ACCEPT = acceptedExtensions("material").join(",");
/** Two files at a time: steady progress without saturating the teacher's upload bandwidth. */
const PARALLEL_FILES = 2;

type Started =
  | { materialId: string; method: "single"; uploadUrl: string; headers: Record<string, string> }
  | { materialId: string; method: "multipart"; partSizeBytes: number; partCount: number };
type PartUrl = { partNumber: number; url: string };

/**
 * One material: start → bytes straight to storage (one PUT, or parts for videos) → finish
 * (server verifies the real type). If the transfer itself fails or is cancelled, the pending
 * record is deleted (which also aborts an open multipart upload); a server-side verification
 * failure stays visible as FAILED.
 */
async function uploadMaterial(lessonId: string, file: File, mimeType: string, signal: AbortSignal, onProgress: (loaded: number) => void, onVerify: () => void) {
  const started = await apiSend<Started>("post", `/admin/lessons/${lessonId}/materials`, { filename: file.name, mimeType, sizeBytes: file.size });
  const id = started.materialId;
  let parts: { partNumber: number; etag: string }[] | undefined;
  try {
    if (started.method === "single") {
      await putToPresignedUrl(started.uploadUrl, file, { headers: started.headers, signal, onProgress });
    } else {
      parts = await uploadParts({
        file,
        partSizeBytes: started.partSizeBytes,
        partCount: started.partCount,
        presign: (numbers) => apiSend<PartUrl[]>("post", `/admin/materials/${id}/parts`, { partNumbers: numbers }),
        signal,
        onProgress,
        parallel: 2,
      });
    }
  } catch (error) {
    await apiSend("delete", `/admin/materials/${id}`).catch(() => undefined);
    throw error;
  }
  onVerify();
  await apiSend("post", `/admin/materials/${id}/finish`, parts ? { parts } : {});
}

type QueueItem = { key: string; file: File; mimeType: string; status: UploadItemStatus; loaded: number; error: string | null };

export function MaterialsPanel({ lessonId, materials }: { lessonId: string; materials: MaterialRow[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const dragDepth = useRef(0);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);

  const summary = summarizeUploads(queue.map((item) => item.status));
  const busy = !summary.finished;

  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  const update = (key: string, patch: Partial<QueueItem>) => setQueue((items) => items.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  async function uploadOne(item: QueueItem, signal: AbortSignal) {
    if (signal.aborted) return update(item.key, { status: "cancelled" });
    update(item.key, { status: "uploading" });
    try {
      await uploadMaterial(
        lessonId,
        item.file,
        item.mimeType,
        signal,
        (loaded) => update(item.key, { loaded: Math.min(loaded, item.file.size) }),
        () => update(item.key, { status: "verifying", loaded: item.file.size }),
      );
      update(item.key, { status: "done" });
      router.refresh();
    } catch (error) {
      if (error instanceof UploadAbortedError || signal.aborted) update(item.key, { status: "cancelled" });
      else update(item.key, { status: "failed", error: error instanceof ApiClientError ? errorMessage(error) : t.uploadFailed });
      // A FAILED record (bytes didn't match) should show up in the list below.
      if (error instanceof ApiClientError) router.refresh();
    }
  }

  async function start(files: File[]) {
    if (busy || files.length === 0) return;
    // Every file is checked with the server's rules first; a bad file never stops the others.
    const items: QueueItem[] = files.map((file, index) => {
      const prepared = prepareMaterialFile(file);
      const base = { key: `${Date.now()}-${index}`, file, loaded: 0 };
      if (prepared.ok) return { ...base, mimeType: prepared.mimeType, status: "queued", error: null };
      return { ...base, mimeType: "", status: "failed", error: prepared.reason === "type" ? t.typeNotAllowed : t.tooLarge(prepared.limit) };
    });
    setQueue(items);
    if (input.current) input.current.value = "";

    const abort = new AbortController();
    controller.current = abort;
    const pending = items.filter((item) => item.status === "queued");
    let next = 0;
    const lane = async () => {
      while (next < pending.length) await uploadOne(pending[next++], abort.signal);
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL_FILES, pending.length) }, lane));
    controller.current = null;
  }

  const onDrop = (event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    void start([...event.dataTransfer.files]);
  };

  return (
    <div
      className={cn("relative space-y-4 rounded-md", dragging && "outline-2 outline-offset-4 outline-rose-deep outline-dashed")}
      onDragEnter={(event) => {
        if (busy || !event.dataTransfer.types.includes("Files")) return;
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDragOver={(event) => {
        if (!busy && event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={onDrop}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">{t.intro}</p>
        <div>
          <input
            ref={input}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            id="material-file"
            tabIndex={-1}
            onChange={(e) => void start([...(e.target.files ?? [])])}
          />
          <Button onClick={() => input.current?.click()} disabled={busy}>
            <Upload aria-hidden /> {t.choose}
          </Button>
        </div>
      </div>

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/85 text-sm font-medium">
          <Upload aria-hidden className="mr-2 size-4" /> {t.dropHere}
        </div>
      )}

      <div>
        {queue.length > 0 && (
          <section aria-label={t.queueLabel} className="space-y-3 rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium" aria-live="polite">{busy ? t.progress(summary.total - summary.active, summary.total) : t.summary(summary.done, summary.failed, summary.cancelled)}</p>
              {busy ? (
                <Button variant="outline" size="sm" onClick={() => controller.current?.abort()}>
                  <X aria-hidden /> {t.cancelAll}
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setQueue([])}>
                  {t.clearList}
                </Button>
              )}
            </div>
            <ul className="space-y-2">
              {queue.map((item) => (
                <QueueRow key={item.key} item={item} />
              ))}
            </ul>
            {busy && <p className="text-xs text-muted-foreground">{t.leaveWarning}</p>}
          </section>
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

function QueueRow({ item }: { item: QueueItem }) {
  const percent = item.file.size ? Math.round((item.loaded / item.file.size) * 100) : 0;
  const showBar = item.status === "uploading" || item.status === "verifying";
  return (
    <li className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          {item.status === "done" ? (
            <CheckCircle2 aria-hidden className="size-4 shrink-0 text-rose-deep" />
          ) : item.status === "failed" ? (
            <XCircle aria-hidden className="size-4 shrink-0 text-destructive" />
          ) : (
            <FileText aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{item.file.name}</span>
        </span>
        <span className={cn("shrink-0 text-xs", item.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
          {t.fileStatus[item.status]}
          {item.status === "uploading" && ` · ${percent}%`}
        </span>
      </div>
      {showBar && (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={t.uploadingLabel(item.file.name)}
        >
          <div className="h-full bg-rose-deep transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      )}
      {item.status === "uploading" && (
        <p className="text-xs text-muted-foreground">
          {formatBytes(item.loaded)} / {formatBytes(item.file.size)}
        </p>
      )}
      {item.error && <p className="text-xs text-destructive">{item.error}</p>}
    </li>
  );
}

function MaterialItem({ material, first, last }: { material: MaterialRow; first: boolean; last: boolean }) {
  const { run, pending } = useApiAction();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(material.displayName);
  const url = `/admin/materials/${material.id}`;
  const Icon = material.mimeType.startsWith("video/") ? Film : FileText;

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
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
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
