"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Film, Play, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { EmptyState } from "@/components/admin/page-parts";
import { formatBytes, putToPresignedUrl, runPool, UploadAbortedError, withRetries } from "@/components/admin/uploads";
import { errorMessage, useApiAction } from "@/components/admin/use-api-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiClientError, apiSend } from "@/lib/api/client";
import { formatDateTime } from "@/lib/datetime";
import { admin } from "@/i18n/admin";
import { common } from "@/i18n/common";
import { RecordingPreview } from "./recording-preview";

const t = admin.recordings;

export type RecordingRow = {
  id: string;
  part: number;
  status: "WAITING" | "PROCESSING" | "IMPORTING" | "READY" | "FAILED";
  source: "UPLOAD" | "ZOOM";
  sizeBytes: number | null;
  errorMessage: string | null;
  readyAt: Date | null;
  displayName: string | null;
};

const PARALLEL_PARTS = 3;
const PART_ATTEMPTS = 3;
const URL_BATCH = 6;

type Started = { recordingId: string; partSizeBytes: number; partCount: number };
type PartUrl = { partNumber: number; url: string };

/**
 * Multipart upload: start → part URLs in batches → 3 parallel PUTs (each retried up to 3 times
 * with a fresh URL, ETag read from the response) → complete. Cancel aborts the upload.
 */
async function uploadRecording(lessonId: string, file: File, signal: AbortSignal, onProgress: (loaded: number) => void, onStarted: (id: string) => void) {
  const started = await apiSend<Started>("post", `/admin/lessons/${lessonId}/recordings`, {
    filename: file.name,
    mimeType: file.type || "video/mp4",
    sizeBytes: file.size,
  });
  onStarted(started.recordingId);
  const loaded = new Map<number, number>();
  const report = () => onProgress([...loaded.values()].reduce((a, b) => a + b, 0));
  const etags: { partNumber: number; etag: string }[] = [];
  const presign = (numbers: number[]) =>
    apiSend<PartUrl[]>("post", `/admin/recordings/${started.recordingId}/parts`, { partNumbers: numbers });

  const all = Array.from({ length: started.partCount }, (_, i) => i + 1);
  for (let offset = 0; offset < all.length; offset += URL_BATCH) {
    if (signal.aborted) throw new UploadAbortedError();
    const batch = all.slice(offset, offset + URL_BATCH);
    const urls = new Map((await presign(batch)).map((p) => [p.partNumber, p.url]));

    await runPool(batch, PARALLEL_PARTS, async (partNumber) => {
      const start = (partNumber - 1) * started.partSizeBytes;
      const blob = file.slice(start, Math.min(file.size, start + started.partSizeBytes));
      const { etag } = await withRetries(
        PART_ATTEMPTS,
        async (attempt) => {
          loaded.set(partNumber, 0);
          // A retry gets a fresh URL in case the previous one expired.
          const url = attempt === 1 ? urls.get(partNumber)! : (await presign([partNumber]))[0].url;
          const result = await putToPresignedUrl(url, blob, {
            signal,
            onProgress: (bytes) => {
              loaded.set(partNumber, bytes);
              report();
            },
          });
          if (!result.etag) throw new Error("Storage did not expose the ETag header");
          return result;
        },
        signal,
      );
      loaded.set(partNumber, blob.size);
      report();
      etags.push({ partNumber, etag: etag! });
    });
  }

  return apiSend<{ status: "READY" }>("post", `/admin/recordings/${started.recordingId}/complete`, {
    parts: etags.sort((a, b) => a.partNumber - b.partNumber),
  });
}

type Progress = { name: string; loaded: number; total: number; phase: "upload" | "finish" };

export function RecordingsPanel({ lessonId, recordings }: { lessonId: string; recordings: RecordingRow[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const activeId = useRef<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!progress) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [progress]);

  async function abortServerSide() {
    if (activeId.current) await apiSend("post", `/admin/recordings/${activeId.current}/abort`).catch(() => undefined);
  }

  async function upload(file: File) {
    const abort = new AbortController();
    controller.current = abort;
    activeId.current = null;
    setProgress({ name: file.name, loaded: 0, total: file.size, phase: "upload" });
    try {
      await uploadRecording(
        lessonId,
        file,
        abort.signal,
        (loaded) => setProgress((p) => (p ? { ...p, loaded: Math.min(loaded, p.total), phase: loaded >= p.total ? "finish" : "upload" } : p)),
        (id) => {
          activeId.current = id;
          setUploadingId(id);
        },
      );
      toast.success(t.uploaded);
    } catch (error) {
      if (error instanceof UploadAbortedError || abort.signal.aborted) {
        await abortServerSide();
        toast.info(t.cancelled);
      } else if (error instanceof ApiClientError) {
        // Completion/validation failures are recorded as FAILED with a message by the server.
        toast.error(errorMessage(error));
      } else {
        await abortServerSide();
        toast.error(t.uploadFailed);
      }
    } finally {
      controller.current = null;
      activeId.current = null;
      setUploadingId(null);
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
            accept="video/mp4,.mp4,.m4v"
            className="sr-only"
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
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate">{progress.phase === "finish" ? t.finishing : t.uploading(progress.name)}</p>
              {progress.phase === "upload" && (
                <Button variant="outline" size="sm" onClick={() => controller.current?.abort()}>
                  <X aria-hidden /> {t.cancel}
                </Button>
              )}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={t.uploading(progress.name)}>
              <div className="h-full bg-rose-deep transition-[width]" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {formatBytes(progress.loaded)} / {formatBytes(progress.total)} · {percent}% — {t.leaveWarning}
            </p>
          </div>
        )}
      </div>

      {recordings.length === 0 ? (
        <EmptyState>{t.empty}</EmptyState>
      ) : (
        <ul className="divide-y rounded-md border">
          {recordings.map((recording) => (
            <RecordingItem key={recording.id} recording={recording} uploading={uploadingId === recording.id} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RecordingItem({ recording, uploading }: { recording: RecordingRow; uploading: boolean }) {
  const { run, pending } = useApiAction();
  const [previewing, setPreviewing] = useState(false);
  const name = recording.displayName ?? t.part(recording.part);

  return (
    <li className="space-y-3 px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <Film className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 space-y-1">
            <p className="truncate font-medium">
              {t.part(recording.part)} · {name}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant={recording.status === "READY" ? "outline" : recording.status === "FAILED" ? "destructive" : "secondary"}>{t.status[recording.status]}</Badge>
              <span>{t.source[recording.source]}</span>
              {recording.sizeBytes !== null && <span>{formatBytes(recording.sizeBytes)}</span>}
              {recording.readyAt && <span>{formatDateTime(recording.readyAt)}</span>}
            </div>
            {recording.status === "FAILED" && recording.errorMessage && <p className="text-xs text-destructive">{recording.errorMessage}</p>}
            {recording.status === "IMPORTING" && !uploading && <p className="text-xs text-muted-foreground">{t.importingHint}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1 self-start sm:self-center">
          {recording.status === "READY" && (
            <Button variant="ghost" size="sm" onClick={() => setPreviewing((v) => !v)} aria-expanded={previewing}>
              <Play aria-hidden /> {previewing ? t.hidePreview : t.preview}
            </Button>
          )}
          <ConfirmAction
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label={`${common.actions.delete}: ${name}`} disabled={pending || uploading}>
                <Trash2 aria-hidden className="text-destructive" />
              </Button>
            }
            title={t.deleteTitle}
            description={t.deleteBody}
            confirmLabel={common.actions.delete}
            destructive
            onConfirm={() => run(() => apiSend("delete", `/admin/recordings/${recording.id}`), { success: t.deleted })}
          />
        </div>
      </div>
      {previewing && <RecordingPreview recordingId={recording.id} name={name} />}
    </li>
  );
}
