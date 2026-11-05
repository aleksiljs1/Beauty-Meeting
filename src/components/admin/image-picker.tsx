"use client";

import { Check, ImageIcon, Loader2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "@/components/admin/use-api-action";
import { admin } from "@/i18n/admin";
import { apiGet, apiSend } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const t = admin.imagePicker;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

type GalleryPhoto = { id: string; alt: string; isPublished: boolean };
type UploadGrant = { uploadKey: string; uploadUrl: string; headers: Record<string, string> };

/** The admin's own preview route (works for unpublished photos too). */
const previewOf = (id: string) => `/admin/permbajtja/galeria/${id}/foto`;

/**
 * Photo of a course or lesson: picked from the gallery, or uploaded on the spot (it lands in the
 * gallery, published but not shown on the Galeria page). `value` is the gallery item id.
 */
export function ImagePicker({
  value,
  onChange,
  altText,
  emptyHint,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  /** Description stored with a newly uploaded photo (e.g. the course title). */
  altText: string;
  /** What shows without a photo, e.g. "the course photo". */
  emptyHint: string;
}) {
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState<GalleryPhoto[] | null>(null);
  const [busy, setBusy] = useState<"upload" | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function openGallery() {
    setOpen(true);
    setError(null);
    try {
      setPhotos(await apiGet<GalleryPhoto[]>("/admin/content/gallery"));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function choose(photo: GalleryPhoto) {
    setBusy(photo.id);
    setError(null);
    try {
      // A cover is shown on public pages: an unpublished gallery photo gets published.
      if (!photo.isPublished) await apiSend("patch", `/admin/content/gallery/${photo.id}`, { isPublished: true });
      onChange(photo.id);
      setOpen(false);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function upload(file: File) {
    if (!ACCEPTED.includes(file.type)) return setError(t.badType);
    if (file.size > MAX_BYTES) return setError(t.tooLarge);
    setBusy("upload");
    setError(null);
    try {
      const grant = await apiSend<UploadGrant>("post", "/admin/content/gallery/uploads", { filename: file.name, mimeType: file.type, sizeBytes: file.size });
      // Straight to storage with plain fetch — never through the API client (no Bearer token).
      const put = await fetch(grant.uploadUrl, { method: "PUT", body: file, headers: grant.headers });
      if (!put.ok) throw new Error(t.uploadFailed);
      const item = await apiSend<{ id: string }>("post", "/admin/content/gallery", {
        alt: altText.trim() || t.defaultAlt,
        caption: "",
        isPublished: true,
        showInGallery: false,
        showOnHomeHero: false,
        showOnHomeGallery: false,
        showOnAbout: false,
        uploadKey: grant.uploadKey,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      onChange(item.id);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error && cause.message === t.uploadFailed ? t.uploadFailed : errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  const uploadInput = (
    <input
      ref={fileRef}
      type="file"
      accept={ACCEPTED.join(",")}
      className="sr-only"
      tabIndex={-1}
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void upload(file);
      }}
    />
  );

  return (
    <div className="grid gap-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden rounded-md border bg-muted sm:w-48">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element -- admin-only preview route, not optimizable
            <img src={previewOf(value)} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-1 p-3 text-center text-xs text-muted-foreground">
              <ImageIcon aria-hidden className="size-5" />
              {emptyHint}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void openGallery()}>
            <ImageIcon aria-hidden /> {t.fromGallery}
          </Button>
          <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy === "upload"}>
            {busy === "upload" ? <Loader2 aria-hidden className="animate-spin" /> : <Upload aria-hidden />} {t.upload}
          </Button>
          {value && (
            <Button type="button" variant="ghost" onClick={() => onChange(null)}>
              <X aria-hidden /> {t.remove}
            </Button>
          )}
        </div>
        {uploadInput}
      </div>
      {error && !open && <p className="text-xs text-destructive">{error}</p>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t.dialogTitle}</DialogTitle>
            <DialogDescription>{t.dialogBody}</DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!photos && !error ? (
            <div className="flex min-h-32 items-center justify-center">
              <Loader2 aria-hidden className="size-6 animate-spin" />
            </div>
          ) : photos && photos.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{t.emptyGallery}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos?.map((photo) => {
                const selected = photo.id === value;
                return (
                  <li key={photo.id}>
                    <button
                      type="button"
                      onClick={() => void choose(photo)}
                      disabled={busy !== null}
                      aria-pressed={selected}
                      className={cn(
                        "group relative block aspect-[16/10] w-full overflow-hidden rounded-md border focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                        selected ? "border-rose ring-2 ring-rose" : "hover:border-rose/60",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- admin-only preview route */}
                      <img src={previewOf(photo.id)} alt={photo.alt} loading="lazy" className="size-full object-cover" />
                      {(selected || busy === photo.id) && (
                        <span className="absolute top-2 right-2 grid size-6 place-items-center rounded-full bg-rose text-primary-foreground">
                          {busy === photo.id ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Check aria-hidden className="size-3.5" />}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy === "upload"}>
              {busy === "upload" ? <Loader2 aria-hidden className="animate-spin" /> : <Upload aria-hidden />} {t.uploadNew}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
