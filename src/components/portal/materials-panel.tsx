"use client";

import { Download, Eye, FileText, Image as ImageIcon, Loader2, Presentation, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { portalText } from "@/i18n/portal";
import { ApiClientError, apiSend } from "@/lib/api/client";
import { EmptyState } from "./empty-state";

const t = portalText.materials;

export type MaterialItem = { id: string; displayName: string; mimeType: string; sizeBytes: number; viewable: boolean };

type Viewer = { id: string; name: string; url: string; kind: "pdf" | "image" };

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return t.sizeKb(Math.max(1, Math.round(bytes / 1024)));
  return t.sizeMb((bytes / (1024 * 1024)).toFixed(1).replace(".", ","));
}

function iconFor(mime: string) {
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime.includes("presentation")) return Presentation;
  return FileText;
}

const viewerKind = (mime: string): Viewer["kind"] | null => (mime === "application/pdf" ? "pdf" : mime.startsWith("image/") ? "image" : null);

export function MaterialsPanel({ lessonId, materials, onViewerChange }: { lessonId: string; materials: MaterialItem[]; onViewerChange?: (open: boolean) => void }) {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const grant = async (material: MaterialItem, mode: "view" | "download") => {
    setPending(`${material.id}:${mode}`);
    try {
      // A fresh, short-lived URL every time — checked against the access policy on the server.
      const { url } = await apiSend<{ url: string }>("post", `/lessons/${lessonId}/materials/${material.id}/access`, { mode });
      return url;
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : portalText.states.errorBody);
      return null;
    } finally {
      setPending(null);
    }
  };

  const open = async (material: MaterialItem) => {
    const kind = viewerKind(material.mimeType);
    if (!kind) return;
    const url = await grant(material, "view");
    if (!url) return;
    setViewer({ id: material.id, name: material.displayName, url, kind });
    onViewerChange?.(true);
  };

  const close = () => {
    setViewer(null);
    onViewerChange?.(false);
  };

  const download = async (material: MaterialItem) => {
    const url = await grant(material, "download");
    // Served with Content-Disposition: attachment, so the page stays where it is.
    if (url) window.location.assign(url);
  };

  if (!materials.length) return <EmptyState icon={FileText} title={t.empty} />;

  return (
    <div className="grid gap-4">
      {viewer ? (
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-medium">{viewer.name}</p>
            <Button variant="ghost" size="icon-sm" aria-label={t.closeViewer} onClick={close}>
              <X />
            </Button>
          </div>
          {viewer.kind === "pdf" ? (
            <iframe
              key={viewer.url}
              src={viewer.url}
              title={t.viewerTitle(viewer.name)}
              className="h-[65vh] min-h-96 w-full rounded-md border bg-muted"
            />
          ) : (
            // Presigned, short-lived private URL: next/image optimization doesn't apply here.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={viewer.url} alt={viewer.name} className="max-h-[65vh] w-full rounded-md border bg-muted object-contain" />
          )}
          <p className="text-xs text-muted-foreground">{t.viewerFallback}</p>
        </div>
      ) : null}

      <ul className="grid gap-2">
        {materials.map((material) => {
          const Icon = iconFor(material.mimeType);
          const canView = material.viewable && viewerKind(material.mimeType) !== null;
          const isOpen = viewer?.id === material.id;
          return (
            <li key={material.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3" aria-current={isOpen ? "true" : undefined}>
              <Icon aria-hidden="true" className="size-5 shrink-0 text-rose-deep" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{material.displayName}</p>
                <p className="text-xs text-muted-foreground">
                  {formatSize(material.sizeBytes)}
                  {!canView ? ` · ${t.officeHint}` : null}
                </p>
              </div>
              <div className="flex gap-1.5">
                {canView ? (
                  <Button variant={isOpen ? "secondary" : "outline"} size="lg" disabled={pending !== null} onClick={() => void open(material)}>
                    {pending === `${material.id}:view` ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Eye aria-hidden="true" />}
                    {t.view}
                  </Button>
                ) : null}
                <Button variant="outline" size="lg" disabled={pending !== null} onClick={() => void download(material)}>
                  {pending === `${material.id}:download` ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
                  {t.download}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
