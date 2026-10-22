"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2Icon, UploadIcon } from "lucide-react";
import { useState } from "react";
import { Controller, useForm, type Control } from "react-hook-form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { adminContent } from "@/i18n/admin-content";
import { common } from "@/i18n/common";
import { apiSend } from "@/lib/api/client";
import { galleryItemSchema, galleryVisibilityFields, type GalleryItemInput } from "@/lib/content-schemas";
import { applyFieldIssues, errorMessage, Field, moveItem, OrderButtons, PublishedBadge, StatusMessage, type Status } from "./form-bits";
import type { AdminGalleryItem } from "./types";

const t = adminContent.gallery;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

type UploadGrant = { uploadKey: string; uploadUrl: string; headers: Record<string, string> };

function VisibilityOptions({ control, idPrefix }: { control: Control<GalleryItemInput>; idPrefix: string }) {
  return (
    <fieldset className="grid gap-3">
      <legend className="text-sm font-medium">{t.displayHeading}</legend>
      <p className="text-sm text-muted-foreground">{t.displayHint}</p>
      {galleryVisibilityFields.map((name) => (
        <Controller
          key={name}
          control={control}
          name={name}
          render={({ field }) => (
            <label htmlFor={`${idPrefix}-${name}`} className="flex items-center gap-3 text-sm">
              <Switch id={`${idPrefix}-${name}`} checked={field.value} onCheckedChange={field.onChange} />
              {t.visibilityLabels[name]}
            </label>
          )}
        />
      ))}
    </fieldset>
  );
}

function UploadForm({ onUploaded }: { onUploaded: (item: AdminGalleryItem) => void }) {
  // Changing the key remounts (clears) the file input after a successful upload.
  const [inputKey, setInputKey] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string>();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const { register, control, handleSubmit, formState, setError, reset } = useForm<GalleryItemInput>({
    resolver: zodResolver(galleryItemSchema),
    defaultValues: {
      alt: "",
      caption: "",
      isPublished: true,
      showInGallery: false,
      showOnHomeHero: false,
      showOnHomeGallery: false,
      showOnAbout: false,
    },
  });

  const checkFile = (candidate: File | null) => {
    if (!candidate) return t.chooseFile;
    if (!ACCEPTED.includes(candidate.type)) return t.badType;
    if (candidate.size > MAX_BYTES) return t.tooLarge;
    return undefined;
  };

  const onSubmit = handleSubmit(async (values) => {
    const problem = checkFile(file);
    setFileError(problem);
    if (problem || !file) return;
    setStatus({ kind: "busy", text: t.uploading });
    try {
      const grant = await apiSend<UploadGrant>("post", "/admin/content/gallery/uploads", {
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      // Straight to storage with plain fetch — never through the API client (no Bearer token).
      const put = await fetch(grant.uploadUrl, { method: "PUT", body: file, headers: grant.headers });
      if (!put.ok) throw new Error(`upload ${put.status}`);
      const item = await apiSend<AdminGalleryItem>("post", "/admin/content/gallery", {
        ...values,
        uploadKey: grant.uploadKey,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      onUploaded(item);
      reset();
      setFile(null);
      setInputKey((k) => k + 1);
      setStatus({ kind: "ok", text: t.uploaded });
    } catch (error) {
      applyFieldIssues(error, setError);
      setStatus({ kind: "error", text: error instanceof Error && error.message.startsWith("upload ") ? t.uploadFailed : errorMessage(error) });
    }
  });

  const busy = status.kind === "busy";
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5 rounded-md border bg-card p-5 sm:p-6">
      <h2 className="text-2xl">{t.uploadHeading}</h2>
      <Field id="gallery-file" label={t.file} hint={t.fileHint} error={fileError}>
        {(aria) => (
          <Input
            key={inputKey}
            type="file"
            accept={ACCEPTED.join(",")}
            {...aria}
            onChange={(event) => {
              const chosen = event.target.files?.[0] ?? null;
              setFile(chosen);
              setFileError(chosen ? checkFile(chosen) : undefined);
            }}
          />
        )}
      </Field>
      <Field id="gallery-alt" label={t.alt} hint={t.altHint} error={formState.errors.alt?.message}>
        {(aria) => <Input {...aria} {...register("alt")} />}
      </Field>
      <Field id="gallery-caption" label={t.caption} error={formState.errors.caption?.message}>
        {(aria) => <Input {...aria} {...register("caption")} />}
      </Field>
      <VisibilityOptions control={control} idPrefix="gallery-new" />
      <Controller
        control={control}
        name="isPublished"
        render={({ field }) => (
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={field.value} onCheckedChange={field.onChange} />
            {t.isPublished}
          </label>
        )}
      />
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" className="px-5" disabled={busy}>
          <UploadIcon aria-hidden />
          {busy ? t.uploading : t.upload}
        </Button>
        <StatusMessage status={status} />
      </div>
    </form>
  );
}

function ItemCard({
  item,
  index,
  count,
  busy,
  onChange,
  onMove,
  onDelete,
}: {
  item: AdminGalleryItem;
  index: number;
  count: number;
  busy: boolean;
  onChange: (item: AdminGalleryItem) => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const { register, control, handleSubmit, formState, setError, reset } = useForm<GalleryItemInput>({
    resolver: zodResolver(galleryItemSchema),
    defaultValues: {
      alt: item.alt,
      caption: item.caption ?? "",
      isPublished: item.isPublished,
      showInGallery: item.showInGallery,
      showOnHomeHero: item.showOnHomeHero,
      showOnHomeGallery: item.showOnHomeGallery,
      showOnAbout: item.showOnAbout,
    },
  });

  const save = async (patch: Partial<GalleryItemInput>) => {
    setStatus({ kind: "busy", text: adminContent.status.saving });
    try {
      const updated = await apiSend<AdminGalleryItem>("patch", `/admin/content/gallery/${item.id}`, patch);
      onChange(updated);
      reset({
        alt: updated.alt,
        caption: updated.caption ?? "",
        isPublished: updated.isPublished,
        showInGallery: updated.showInGallery,
        showOnHomeHero: updated.showOnHomeHero,
        showOnHomeGallery: updated.showOnHomeGallery,
        showOnAbout: updated.showOnAbout,
      });
      setStatus({ kind: "ok", text: adminContent.status.saved });
    } catch (error) {
      applyFieldIssues(error, setError);
      setStatus({ kind: "error", text: errorMessage(error) });
    }
  };

  const onSubmit = handleSubmit(({ alt, caption, showInGallery, showOnHomeHero, showOnHomeGallery, showOnAbout }) =>
    save({ alt, caption, showInGallery, showOnHomeHero, showOnHomeGallery, showOnAbout }),
  );
  const saving = status.kind === "busy";

  return (
    <li className="flex flex-col overflow-hidden rounded-md border bg-card">
      <div className="relative aspect-[4/3] bg-muted">
        {/* Admin-only preview route; plain <img> because it is cookie-authorized and never optimized/cached publicly. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.previewSrc} alt={item.alt} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
      </div>
      <form onSubmit={onSubmit} noValidate className="grid gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PublishedBadge published={item.isPublished} />
          {item.width && item.height && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {item.width} × {item.height}
            </span>
          )}
        </div>
        <Field id={`alt-${item.id}`} label={t.alt} error={formState.errors.alt?.message}>
          {(aria) => <Input {...aria} {...register("alt")} />}
        </Field>
        <Field id={`caption-${item.id}`} label={t.caption} error={formState.errors.caption?.message}>
          {(aria) => <Input {...aria} {...register("caption")} />}
        </Field>
        <VisibilityOptions control={control} idPrefix={`gallery-${item.id}`} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="outline" disabled={saving || !formState.isDirty}>
            {common.actions.save}
          </Button>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={item.isPublished} disabled={saving || busy} onCheckedChange={(value) => void save({ isPublished: value })} />
            {adminContent.status.published}
          </label>
        </div>
        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <OrderButtons index={index} count={count} label={item.alt} disabled={busy} onMove={onMove} />
          <Button type="button" variant="destructive" size="icon" onClick={onDelete} aria-label={`${common.actions.delete}: ${item.alt}`}>
            <Trash2Icon aria-hidden />
          </Button>
        </div>
        <StatusMessage status={status} />
      </form>
    </li>
  );
}

export function GalleryEditor({ initial }: { initial: AdminGalleryItem[] }) {
  const [items, setItems] = useState(initial);
  const [deleting, setDeleting] = useState<AdminGalleryItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const move = async (index: number, delta: -1 | 1) => {
    const previous = items;
    const next = moveItem(items, index, delta);
    setItems(next);
    setBusy(true);
    setStatus({ kind: "busy", text: adminContent.status.saving });
    try {
      await apiSend("put", "/admin/content/gallery/order", { ids: next.map((i) => i.id) });
      setStatus({ kind: "ok", text: adminContent.status.saved });
    } catch (error) {
      setItems(previous);
      setStatus({ kind: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async (item: AdminGalleryItem) => {
    setBusy(true);
    try {
      await apiSend("delete", `/admin/content/gallery/${item.id}`);
      setItems((list) => list.filter((i) => i.id !== item.id));
      setDeleting(null);
      setStatus({ kind: "ok", text: adminContent.status.deleted });
    } catch (error) {
      setStatus({ kind: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-8">
      <UploadForm onUploaded={(item) => setItems((list) => [...list, item])} />
      <StatusMessage status={status} />
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed px-6 py-10 text-center text-muted-foreground">{t.empty}</p>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item, index) => (
            <ItemCard
              key={item.id}
              item={item}
              index={index}
              count={items.length}
              busy={busy}
              onChange={(updated) => setItems((list) => list.map((i) => (i.id === updated.id ? updated : i)))}
              onMove={(delta) => void move(index, delta)}
              onDelete={() => setDeleting(item)}
            />
          ))}
        </ul>
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.deleteBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{common.actions.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                if (deleting) void confirmDelete(deleting);
              }}
            >
              {common.actions.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
