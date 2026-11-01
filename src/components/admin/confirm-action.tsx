"use client";

import { useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { common } from "@/i18n/common";

/**
 * Confirmation dialog for destructive or significant actions. The dialog stays open (with a
 * busy button) until the action finishes, so a double click can't run it twice.
 */
export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel,
  destructive = false,
  onConfirm,
  open: controlledOpen,
  onOpenChange,
  typeToConfirm,
}: {
  /** Omit when the dialog is opened from elsewhere (e.g. a dropdown item) via `open`. */
  trigger?: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<unknown>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** For the most destructive actions: the confirm button stays off until this is typed. */
  typeToConfirm?: { text: string; label: string };
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");
  const typedOk = !typeToConfirm || typed.trim() === typeToConfirm.text;

  async function confirm() {
    setBusy(true);
    try {
      const shouldClose = await onConfirm();
      if (shouldClose !== false) setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setTyped("");
        setOpen(next);
      }}
    >
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {typeToConfirm && (
          <div className="grid gap-1.5">
            <Label htmlFor="confirm-typed">{typeToConfirm.label}</Label>
            <Input id="confirm-typed" autoComplete="off" inputMode="numeric" value={typed} onChange={(event) => setTyped(event.target.value)} disabled={busy} />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{common.actions.cancel}</AlertDialogCancel>
          <Button variant={destructive ? "destructive" : "default"} onClick={confirm} disabled={busy || !typedOk} aria-busy={busy}>
            {busy ? common.actions.loading : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
