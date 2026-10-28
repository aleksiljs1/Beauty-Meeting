"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Library, Trash2 } from "lucide-react";
import { CheckList } from "@/components/admin/check-list";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { EmptyState } from "@/components/admin/page-parts";
import { FileSummary, OpenFileButton, RenameFileButton, type FileInfo } from "@/components/admin/materials/material-parts";
import { MaterialUploader } from "@/components/admin/materials/material-uploader";
import { formatBytes } from "@/components/admin/uploads";
import { errorMessage, useApiAction } from "@/components/admin/use-api-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiGet, apiSend } from "@/lib/api/client";
import { admin } from "@/i18n/admin";
import { common } from "@/i18n/common";
import type { LibraryFile } from "@/server/queries/admin";

const t = admin.materials;

export type MaterialRow = FileInfo & { id: string };

export function MaterialsPanel({ lessonId, materials }: { lessonId: string; materials: MaterialRow[] }) {
  return (
    <MaterialUploader lessonId={lessonId} intro={t.intro} actions={<LibraryPicker lessonId={lessonId} attached={materials.map((m) => m.fileId)} />}>
      {materials.length === 0 ? (
        <EmptyState>{t.empty}</EmptyState>
      ) : (
        <ul className="divide-y rounded-md border">
          {materials.map((material, index) => (
            <MaterialItem key={material.id} material={material} first={index === 0} last={index === materials.length - 1} />
          ))}
        </ul>
      )}
    </MaterialUploader>
  );
}

function MaterialItem({ material, first, last }: { material: MaterialRow; first: boolean; last: boolean }) {
  const { run, pending } = useApiAction();
  const url = `/admin/materials/${material.id}`;
  // A finished file is only taken off this lesson (it stays in the library); an unfinished
  // or failed upload is useless anywhere, so it is deleted.
  const ready = material.status === "READY";

  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <FileSummary file={material} />
      <div className="flex flex-wrap items-center gap-1 self-start sm:self-center">
        <OpenFileButton file={material} />
        <Button variant="ghost" size="icon-sm" aria-label={`${t.moveUp}: ${material.displayName}`} disabled={pending || first} onClick={() => run(() => apiSend("patch", url, { move: "up" }))}>
          <ArrowUp aria-hidden />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={`${t.moveDown}: ${material.displayName}`} disabled={pending || last} onClick={() => run(() => apiSend("patch", url, { move: "down" }))}>
          <ArrowDown aria-hidden />
        </Button>
        <RenameFileButton file={material} />
        <ConfirmAction
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={`${ready ? t.remove : common.actions.delete}: ${material.displayName}`} disabled={pending}>
              <Trash2 aria-hidden className="text-destructive" />
            </Button>
          }
          title={ready ? t.removeTitle : t.deleteTitle}
          description={ready ? t.removeBody(material.displayName) : t.deleteBody(material.displayName, 0)}
          confirmLabel={ready ? t.remove : common.actions.delete}
          destructive={!ready}
          onConfirm={() =>
            run(() => apiSend("delete", ready ? url : `/admin/library/${material.fileId}`), { success: ready ? t.removed : t.deleted })
          }
        />
      </div>
    </li>
  );
}

/** "Nga biblioteka": pick already uploaded files to show in this lesson. */
function LibraryPicker({ lessonId, attached }: { lessonId: string; attached: string[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [files, setFiles] = useState<LibraryFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { run, pending } = useApiAction();

  useEffect(() => {
    if (!open) return;
    let current = true;
    // Short pause so typing a name doesn't send a request per key.
    const timer = setTimeout(() => {
      apiGet<LibraryFile[]>("/admin/library", { ready: 1, q: q || undefined })
        .then((data) => current && (setFiles(data), setError(null)))
        .catch((err: unknown) => current && setError(errorMessage(err)));
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [open, q]);

  const available = files?.filter((f) => !attached.includes(f.id)) ?? [];

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      setSelected(new Set());
      setQ("");
      setFiles(null);
    }
  }

  async function add() {
    const done = await run(() => apiSend("post", `/admin/lessons/${lessonId}/materials`, { fileIds: [...selected] }), { success: t.library.added(selected.size) });
    if (done) changeOpen(false);
  }

  return (
    <>
      <Button variant="outline" onClick={() => changeOpen(true)}>
        <Library aria-hidden /> {t.library.pick}
      </Button>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.library.pickTitle}</DialogTitle>
            <DialogDescription>{t.library.pickDescription}</DialogDescription>
          </DialogHeader>
          <Input type="search" aria-label={t.library.search} placeholder={t.library.search} value={q} onChange={(e) => setQ(e.target.value)} />
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : !files ? (
            <p className="text-sm text-muted-foreground">{common.actions.loading}</p>
          ) : available.length === 0 ? (
            <p className="text-sm text-muted-foreground">{q ? t.library.noMatch : t.library.nothingToAdd}</p>
          ) : (
            <CheckList
              legend={t.library.files}
              items={available.map((f) => ({ id: f.id, label: f.displayName, description: `${formatBytes(f.sizeBytes)} · ${t.library.usedIn(f.lessons.length)}` }))}
              selected={selected}
              onChange={setSelected}
            />
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => changeOpen(false)}>
              {common.actions.cancel}
            </Button>
            <Button onClick={add} disabled={pending || selected.size === 0}>
              {t.library.add(selected.size)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
