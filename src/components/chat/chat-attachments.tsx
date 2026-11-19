"use client";

import { ChevronLeft, ChevronRight, Download, FileText, Loader2, Presentation, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type TouchEvent } from "react";
import { toast } from "sonner";
import { formatBytes, putToPresignedUrl, UploadAbortedError } from "@/components/admin/uploads";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { chatText as t } from "@/i18n/chat";
import { ApiClientError, apiSend } from "@/lib/api/client";
import { isChatPhoto, MAX_ATTACHMENTS, type ChatAttachmentItem } from "@/lib/chat";
import { cn } from "@/lib/utils";
import { checkDeclaredFile, declaredMimeFor, formatLimit } from "@/server/storage/file-types";

/** What the photo and file buttons offer (the server checks the real type again). */
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
export const FILE_ACCEPT =
  ".pdf,.docx,.pptx,.jpg,.jpeg,.png,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation";

// --- Picking and uploading -------------------------------------------------------------------

/** Phone photos are big (4000 px, several MB): sent at most this size, so they go fast on mobile data. */
const MAX_PHOTO_SIDE = 2048;
/** JPEG/WebP photos above this are re-encoded even when small enough in pixels. */
const SHRINK_ABOVE_BYTES = 1.5 * 1024 * 1024;

type Prepared = { blob: Blob; name: string; type: string; width?: number; height?: number };

/** Shrinks a big photo in the browser (keeps PNG as PNG; everything else becomes JPEG) and measures it. */
async function preparePhoto(file: File): Promise<Prepared> {
  const original: Prepared = { blob: file, name: file.name, type: file.type };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file); // also turns phone photos the right way up (EXIF)
  } catch {
    return original; // not a picture the browser can read: the type check says so
  }
  const { width, height } = bitmap;
  const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(width, height));
  const png = file.type === "image/png";
  if (scale === 1 && (png || file.size <= SHRINK_ABOVE_BYTES)) {
    bitmap.close();
    return { ...original, width, height };
  }
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const type = png ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  canvas.width = 0;
  canvas.height = 0;
  if (!blob || (scale === 1 && blob.size >= file.size)) return { ...original, width, height };
  return { blob, type, width: w, height: h, name: png ? file.name : `${file.name.replace(/\.[^.]+$/, "") || "foto"}.jpg` };
}

export type PendingAttachment = {
  key: string;
  name: string;
  mimeType: string;
  size: number;
  /** Photos: a local preview while (and after) uploading. */
  preview: string | null;
  progress: number;
  status: "uploading" | "ready" | "failed";
  /** The server's id once the upload has started. */
  id?: string;
  controller: AbortController;
};

/**
 * Photos and files picked for the next message. Each one starts uploading straight away (straight
 * to storage, with progress), so pressing send only attaches what is already there.
 */
export function usePendingAttachments(chatId: string) {
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const update = useCallback((key: string, patch: Partial<PendingAttachment>) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }, []);

  const add = useCallback(
    async (picked: File[]) => {
      if (!picked.length) return;
      const room = MAX_ATTACHMENTS - itemsRef.current.length;
      if (picked.length > room) toast.error(t.tooMany(MAX_ATTACHMENTS));
      for (const file of picked.slice(0, Math.max(0, room))) {
        const prepared = file.type.startsWith("image/") ? await preparePhoto(file) : { blob: file, name: file.name, type: file.type };
        const mimeType = declaredMimeFor("chat", prepared.name, prepared.type);
        const check = checkDeclaredFile("chat", { filename: prepared.name, mimeType, sizeBytes: prepared.blob.size });
        if (!check.ok) {
          toast.error(check.reason === "type" ? t.fileType : t.fileTooBig(file.name, formatLimit(check.maxBytes)));
          continue;
        }
        const item: PendingAttachment = {
          key: crypto.randomUUID(),
          name: prepared.name,
          mimeType,
          size: prepared.blob.size,
          preview: isChatPhoto(mimeType) ? URL.createObjectURL(prepared.blob) : null,
          progress: 0,
          status: "uploading",
          controller: new AbortController(),
        };
        itemsRef.current = [...itemsRef.current, item];
        setItems(itemsRef.current);
        void (async () => {
          try {
            const started = await apiSend<{ id: string; uploadUrl: string; headers: Record<string, string> }>("post", `/chats/${chatId}/attachments`, {
              filename: prepared.name,
              mimeType,
              sizeBytes: prepared.blob.size,
              width: prepared.width,
              height: prepared.height,
            });
            if (item.controller.signal.aborted) {
              void apiSend("delete", `/chats/${chatId}/attachments/${started.id}`).catch(() => undefined);
              return;
            }
            update(item.key, { id: started.id });
            await putToPresignedUrl(started.uploadUrl, prepared.blob, {
              headers: started.headers,
              signal: item.controller.signal,
              onProgress: (loaded) => update(item.key, { progress: loaded / prepared.blob.size }),
            });
            update(item.key, { status: "ready", progress: 1 });
          } catch (error) {
            if (error instanceof UploadAbortedError || item.controller.signal.aborted) return;
            toast.error(error instanceof ApiClientError ? error.message : t.uploadFailed(prepared.name));
            update(item.key, { status: "failed" });
          }
        })();
      }
    },
    [chatId, update],
  );

  /** The ✕ on a picked photo or file: stops its upload and deletes what was uploaded. */
  const remove = useCallback(
    (key: string) => {
      const item = itemsRef.current.find((i) => i.key === key);
      if (!item) return;
      item.controller.abort();
      if (item.id) void apiSend("delete", `/chats/${chatId}/attachments/${item.id}`).catch(() => undefined);
      if (item.preview) URL.revokeObjectURL(item.preview);
      itemsRef.current = itemsRef.current.filter((i) => i.key !== key);
      setItems(itemsRef.current);
    },
    [chatId],
  );

  /** After sending: they belong to the message now. */
  const clear = useCallback(() => {
    for (const item of itemsRef.current) if (item.preview) URL.revokeObjectURL(item.preview);
    itemsRef.current = [];
    setItems([]);
  }, []);

  // Closing the chat: stop uploads in progress (anything left unsent is deleted by the server a day later).
  useEffect(
    () => () => {
      for (const item of itemsRef.current) {
        if (item.status === "uploading") item.controller.abort();
        if (item.preview) URL.revokeObjectURL(item.preview);
      }
    },
    [],
  );

  return { items, add, remove, clear, uploading: items.some((i) => i.status === "uploading"), failed: items.some((i) => i.status === "failed") };
}

/** The picked photos and files above the message box: previews, upload progress and ✕. */
export function PendingTray({ items, onRemove }: { items: PendingAttachment[]; onRemove: (key: string) => void }) {
  if (!items.length) return null;
  return (
    <ul className="flex gap-2 overflow-x-auto border-t px-2 pt-2 pb-1">
      {items.map((item) => (
        <li
          key={item.key}
          className={cn("relative size-16 shrink-0 overflow-hidden rounded-lg border bg-muted", item.status === "failed" && "border-destructive ring-2 ring-destructive/40")}
          title={item.name}
        >
          {item.preview ? (
            // A local blob preview of the picked photo.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.preview} alt={item.name} className="size-full object-cover" />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-0.5 p-1 text-center">
              <FileIcon mimeType={item.mimeType} className="size-5" />
              <span className="line-clamp-2 text-[10px] leading-tight break-all">{item.name}</span>
            </div>
          )}
          {item.status === "uploading" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/35" aria-label={t.uploading}>
              <Loader2 className="size-5 animate-spin text-white" aria-hidden />
              <span className="absolute inset-x-0 bottom-0 h-1 bg-white/30">
                <span className="block h-full bg-white transition-[width]" style={{ width: `${Math.round(item.progress * 100)}%` }} />
              </span>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => onRemove(item.key)}
            aria-label={t.removeAttachment(item.name)}
            className="absolute top-0.5 right-0.5 flex size-5 touch-target items-center justify-center rounded-full bg-black/60 text-white outline-none hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="size-3" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}

// --- Showing them in messages ----------------------------------------------------------------

/**
 * The newest working link for each photo, so a chat refetch (every new message) doesn't swap every
 * photo's link and download it again. A link that has expired by the time it's used (a window
 * reopened later) is replaced with a fresh one.
 */
const linkCache = new Map<string, string>();

function requestLink(chatId: string, attachmentId: string, download: boolean) {
  return apiSend<{ url: string }>("post", `/chats/${chatId}/attachments/${attachmentId}/link`, { download }).then((r) => r.url);
}

function useAttachmentSrc(chatId: string, attachment: ChatAttachmentItem) {
  const [src, setSrc] = useState<string | null>(() => {
    const cached = linkCache.get(attachment.id);
    if (cached) return cached;
    if (attachment.url) linkCache.set(attachment.id, attachment.url);
    return attachment.url;
  });
  const retried = useRef(false);
  const refresh = useCallback(() => {
    if (retried.current) return;
    retried.current = true;
    void requestLink(chatId, attachment.id, false)
      .then((url) => {
        linkCache.set(attachment.id, url);
        setSrc(url);
      })
      .catch(() => undefined);
  }, [chatId, attachment.id]);
  useEffect(() => {
    if (!src) refresh();
  }, [src, refresh]);
  return { src, onError: refresh };
}

function ChatImage({ chatId, attachment, className, style }: { chatId: string; attachment: ChatAttachmentItem; className?: string; style?: CSSProperties }) {
  const { src, onError } = useAttachmentSrc(chatId, attachment);
  if (!src) return <span className={cn("block animate-pulse bg-muted", className)} style={style} />;
  // Short-lived private link: next/image optimization doesn't apply.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={attachment.name} onError={onError} draggable={false} className={cn("bg-muted", className)} style={style} />;
}

function FileIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  const Icon = mimeType.includes("presentation") ? Presentation : FileText;
  return <Icon aria-hidden className={cn("shrink-0 text-rose-deep", className)} />;
}

/** Opens a PDF in a new tab, or downloads a Word/PowerPoint file (the page stays where it is). */
async function openFile(chatId: string, attachment: ChatAttachmentItem) {
  const inTab = attachment.mimeType === "application/pdf";
  // Opened before the request, while the tap still counts, or the browser blocks the pop-up.
  const tab = inTab ? window.open("", "_blank") : null;
  try {
    const url = await requestLink(chatId, attachment.id, !inTab || !tab);
    if (tab) {
      tab.opener = null;
      tab.location.href = url;
    } else window.location.assign(url);
  } catch (error) {
    tab?.close();
    toast.error(error instanceof ApiClientError ? error.message : t.loadError);
  }
}

async function downloadAttachment(chatId: string, attachment: ChatAttachmentItem) {
  try {
    window.location.assign(await requestLink(chatId, attachment.id, true)); // served as a download
  } catch (error) {
    toast.error(error instanceof ApiClientError ? error.message : t.loadError);
  }
}

/** Display size of a single photo: within 240 × 300, keeping its shape. */
function photoBox(attachment: ChatAttachmentItem) {
  const w = attachment.width ?? 4;
  const h = attachment.height ?? 3;
  const scale = Math.min(240 / w, 300 / h);
  return { width: Math.round(w * scale), aspectRatio: `${w} / ${h}` };
}

/** Photos (tap to view large) and file cards of one message. */
export function MessageAttachments({ chatId, attachments }: { chatId: string; attachments: ChatAttachmentItem[] }) {
  const [viewing, setViewing] = useState<number | null>(null);
  const photos = attachments.filter((a) => isChatPhoto(a.mimeType));
  const files = attachments.filter((a) => !isChatPhoto(a.mimeType));
  const shown = photos.slice(0, 4);

  return (
    <>
      {photos.length === 1 ? (
        <button type="button" onClick={() => setViewing(0)} aria-label={t.openPhoto} className="max-w-full overflow-hidden rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50" style={{ width: photoBox(photos[0]!).width }}>
          <ChatImage chatId={chatId} attachment={photos[0]!} className="block w-full object-cover" style={{ aspectRatio: photoBox(photos[0]!).aspectRatio }} />
        </button>
      ) : photos.length > 1 ? (
        <div className="grid w-60 max-w-full grid-cols-2 gap-0.5 overflow-hidden rounded-2xl">
          {shown.map((photo, i) => {
            const wide = shown.length === 3 && i === 2; // three photos: the last one spans the row
            const more = i === 3 && photos.length > 4 ? photos.length - 4 : 0;
            return (
              <button
                key={photo.id}
                type="button"
                onClick={() => setViewing(i)}
                aria-label={`${t.openPhoto} (${t.photoOf(i + 1, photos.length)})`}
                className={cn("relative outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset", wide && "col-span-2")}
              >
                <ChatImage chatId={chatId} attachment={photo} className={cn("block w-full object-cover", wide ? "aspect-[2/1]" : "aspect-square")} />
                {more ? <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-xl font-semibold text-white">{t.morePhotos(more)}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {files.map((file) => (
        <button
          key={file.id}
          type="button"
          onClick={() => void openFile(chatId, file)}
          aria-label={t.openFile(file.name)}
          className="flex w-60 max-w-full items-center gap-2.5 rounded-2xl border bg-card px-3 py-2 text-left text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <FileIcon mimeType={file.mimeType} className="size-6" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{file.name}</span>
            <span className="block text-xs text-muted-foreground">{formatBytes(file.size)}</span>
          </span>
          <Download className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      ))}

      {viewing !== null ? <PhotoViewer chatId={chatId} photos={photos} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} /> : null}
    </>
  );
}

/** A message's photos full screen: swipe or arrows between them, download, close. */
function PhotoViewer({ chatId, photos, index, onIndex, onClose }: { chatId: string; photos: ChatAttachmentItem[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const photo = photos[index]!;
  const many = photos.length > 1;
  const go = (step: number) => onIndex((index + step + photos.length) % photos.length);
  const touchX = useRef<number | null>(null);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex h-dvh w-screen max-w-none flex-col gap-0 rounded-none bg-black/95 p-0 text-white ring-0 sm:max-w-none"
        onKeyDown={(event) => {
          if (!many) return;
          if (event.key === "ArrowLeft") go(-1);
          if (event.key === "ArrowRight") go(1);
        }}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <DialogTitle className="min-w-0 flex-1 truncate text-sm font-normal text-white/80">{many ? t.photoOf(index + 1, photos.length) : t.photo}</DialogTitle>
          <DialogDescription className="sr-only">{photo.name}</DialogDescription>
          <Button variant="ghost" size="icon-lg" className="text-white hover:bg-white/10 hover:text-white" aria-label={t.download} onClick={() => void downloadAttachment(chatId, photo)}>
            <Download />
          </Button>
          <Button variant="ghost" size="icon-lg" className="text-white hover:bg-white/10 hover:text-white" aria-label={t.close} onClick={onClose}>
            <X />
          </Button>
        </div>
        <div
          className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4"
          onTouchStart={(event: TouchEvent) => {
            touchX.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event: TouchEvent) => {
            const start = touchX.current;
            const end = event.changedTouches[0]?.clientX;
            touchX.current = null;
            if (many && start !== null && end !== undefined && Math.abs(end - start) > 50) go(end < start ? 1 : -1);
          }}
        >
          <ChatImage key={photo.id} chatId={chatId} attachment={photo} className="max-h-full max-w-full rounded-md bg-transparent object-contain" />
          {many ? (
            <>
              <Button variant="ghost" size="icon-lg" className="absolute left-2 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white" aria-label={t.previous} onClick={() => go(-1)}>
                <ChevronLeft />
              </Button>
              <Button variant="ghost" size="icon-lg" className="absolute right-2 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white" aria-label={t.next} onClick={() => go(1)}>
                <ChevronRight />
              </Button>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
