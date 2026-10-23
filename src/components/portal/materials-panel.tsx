"use client";

import { Download, Eye, FileText, Film, Image as ImageIcon, Loader2, Presentation, X } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { portalText } from "@/i18n/portal";
import { ApiClientError, apiSend } from "@/lib/api/client";
import { EmptyState } from "./empty-state";
import { ProtectedVideo, type VideoGrant } from "./protected-video";

const t = portalText.materials;

export type MaterialItem = { id: string; displayName: string; mimeType: string; sizeBytes: number; viewable: boolean };

type Viewer = { id: string; name: string; kind: "pdf" | "image" | "video"; grant: VideoGrant };

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return t.sizeKb(Math.max(1, Math.round(bytes / 1024)));
  return t.sizeMb((bytes / (1024 * 1024)).toFixed(1).replace(".", ","));
}

function iconFor(mime: string) {
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime.startsWith("video/")) return Film;
  if (mime.includes("presentation")) return Presentation;
  return FileText;
}

function viewerKind(mime: string): Viewer["kind"] | null {
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime === "video/mp4") return "video";
  return null;
}

/** Inline video material: same protected player (grant renewal, deadline stop) as recordings. */
function MaterialVideo({ lessonId, viewer, visible }: { lessonId: string; viewer: Viewer; visible: boolean }) {
  const requestGrant = useCallback(
    () => apiSend<VideoGrant>("post", `/lessons/${lessonId}/materials/${viewer.id}/access`, { mode: "view" }),
    [lessonId, viewer.id],
  );
  return <ProtectedVideo requestGrant={requestGrant} initialGrant={viewer.grant} visible={visible} label={t.viewerTitle(viewer.name)} expiredMessage={t.expired} />;
}

export function MaterialsPanel({
  lessonId,
  materials,
  onViewerChange,
  visible = true,
}: {
  lessonId: string;
  materials: MaterialItem[];
  onViewerChange?: (open: boolean) => void;
  /** False while the panel is hidden (another tab): a playing video is paused. */
  visible?: boolean;
}) {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const grant = async (material: MaterialItem, mode: "view" | "download") => {
    setPending(`${material.id}:${mode}`);
    try {
      // A fresh, short-lived URL every time — checked against the access policy on the server.
      return await apiSend<VideoGrant>("post", `/lessons/${lessonId}/materials/${material.id}/access`, { mode });
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
    const granted = await grant(material, "view");
    if (!granted) return;
    setViewer({ id: material.id, name: material.displayName, kind, grant: granted });
    onViewerChange?.(true);
  };

  const close = () => {
    setViewer(null);
    onViewerChange?.(false);
  };

  const download = async (material: MaterialItem) => {
    const granted = await grant(material, "download");
    // Served with Content-Disposition: attachment, so the page stays where it is.
    if (granted) window.location.assign(granted.url);
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
          {viewer.kind === "video" ? (
            // key: another video gets a fresh player (and grant renewal schedule).
            <MaterialVideo key={viewer.id} lessonId={lessonId} viewer={viewer} visible={visible} />
          ) : viewer.kind === "pdf" ? (
            <iframe
              key={viewer.grant.url}
              src={viewer.grant.url}
              title={t.viewerTitle(viewer.name)}
              className="h-[65vh] min-h-96 w-full rounded-md border bg-muted"
            />
          ) : (
            // Presigned, short-lived private URL: next/image optimization doesn't apply here.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={viewer.grant.url} alt={viewer.name} className="max-h-[65vh] w-full rounded-md border bg-muted object-contain" />
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
