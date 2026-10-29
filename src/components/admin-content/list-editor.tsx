"use client";

import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState, type ReactNode } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { adminContent } from "@/i18n/admin-content";
import { common } from "@/i18n/common";
import { apiSend } from "@/lib/api/client";
import { errorMessage, moveItem, OrderButtons, PublishedBadge, StatusMessage, type Status } from "./form-bits";

type Item = { id: string; title: string };

export type ItemFormProps<T> = { item: T | null; onSaved: (item: T) => void; onCancel: () => void };

/**
 * Shared list editor for services and courses: create/edit in a dialog, publish toggle,
 * up/down ordering (the full order is saved), delete with confirmation.
 */
export function ListEditor<T extends Item>({
  initial,
  endpoint,
  publishField,
  labels,
  summary,
  renderForm,
  deleteOption,
}: {
  initial: T[];
  endpoint: string;
  publishField: keyof T & string;
  labels: { add: string; empty: string; createTitle: string; editTitle: string; publishToggle: string; deleteTitle: string; deleteBody: string };
  summary: (item: T) => ReactNode;
  renderForm: (props: ItemFormProps<T>) => ReactNode;
  /** An extra choice in the delete dialog (e.g. "also delete its lessons"), sent as `?<param>=1`. */
  deleteOption?: (item: T) => { label: string; param: string } | null;
}) {
  const [items, setItems] = useState(initial);
  const [deleteExtra, setDeleteExtra] = useState(false);
  const [editing, setEditing] = useState<T | "new" | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function run(action: () => Promise<void>, done: string = adminContent.status.saved) {
    setBusy(true);
    setStatus({ kind: "busy", text: adminContent.status.saving });
    try {
      await action();
      setStatus({ kind: "ok", text: done });
    } catch (error) {
      setStatus({ kind: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  const move = (index: number, delta: -1 | 1) => {
    const previous = items;
    const next = moveItem(items, index, delta);
    setItems(next);
    void run(async () => {
      try {
        await apiSend("put", `${endpoint}/order`, { ids: next.map((i) => i.id) });
      } catch (error) {
        setItems(previous);
        throw error;
      }
    });
  };

  const togglePublished = (item: T, value: boolean) =>
    run(async () => {
      const updated = await apiSend<T>("patch", `${endpoint}/${item.id}`, { [publishField]: value });
      setItems((list) => list.map((i) => (i.id === item.id ? updated : i)));
    });

  const confirmDelete = (item: T) =>
    run(async () => {
      const option = deleteExtra && deleteOption?.(item);
      await apiSend("delete", `${endpoint}/${item.id}${option ? `?${option.param}=1` : ""}`);
      setItems((list) => list.filter((i) => i.id !== item.id));
      setDeleting(null);
      setDeleteExtra(false);
    }, adminContent.status.deleted);

  const deletingOption = deleting && deleteOption?.(deleting);

  const onSaved = (saved: T) => {
    setItems((list) => (list.some((i) => i.id === saved.id) ? list.map((i) => (i.id === saved.id ? saved : i)) : [...list, saved]));
    setEditing(null);
    setStatus({ kind: "ok", text: adminContent.status.saved });
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button type="button" onClick={() => setEditing("new")} size="lg" className="px-4">
          <PlusIcon aria-hidden />
          {labels.add}
        </Button>
        <StatusMessage status={status} />
      </div>

      {items.length === 0 ? (
        <p className="rounded-md border border-dashed px-6 py-10 text-center text-muted-foreground">{labels.empty}</p>
      ) : (
        <ul className="divide-y rounded-md border bg-card">
          {items.map((item, index) => {
            const published = Boolean(item[publishField]);
            const switchId = `publish-${item.id}`;
            return (
              <li key={item.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{item.title}</p>
                    <PublishedBadge published={published} />
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">{summary(item)}</div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label htmlFor={switchId} className="flex items-center gap-2 text-sm">
                    <Switch id={switchId} checked={published} disabled={busy} onCheckedChange={(v) => void togglePublished(item, v)} />
                    <span className="sr-only">{`${labels.publishToggle}: ${item.title}`}</span>
                    <span aria-hidden>{labels.publishToggle}</span>
                  </label>
                  <OrderButtons index={index} count={items.length} label={item.title} disabled={busy} onMove={(d) => move(index, d)} />
                  <Button type="button" variant="outline" onClick={() => setEditing(item)} aria-label={`${common.actions.edit}: ${item.title}`}>
                    <PencilIcon aria-hidden />
                    {common.actions.edit}
                  </Button>
                  <Button type="button" variant="destructive" size="icon" onClick={() => setDeleting(item)} aria-label={`${common.actions.delete}: ${item.title}`}>
                    <Trash2Icon aria-hidden />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-2xl">{editing === "new" ? labels.createTitle : labels.editTitle}</DialogTitle>
            <DialogDescription className="sr-only">{editing === "new" ? labels.createTitle : labels.editTitle}</DialogDescription>
          </DialogHeader>
          {editing !== null && renderForm({ item: editing === "new" ? null : editing, onSaved, onCancel: () => setEditing(null) })}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (open) return;
          setDeleting(null);
          setDeleteExtra(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{labels.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              <strong className="font-medium text-foreground">{deleting?.title}</strong> — {labels.deleteBody}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deletingOption && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox className="mt-0.5" checked={deleteExtra} onCheckedChange={(checked) => setDeleteExtra(checked === true)} disabled={busy} />
              <span>{deletingOption.label}</span>
            </label>
          )}
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
