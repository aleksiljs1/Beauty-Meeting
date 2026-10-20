"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Mail, MoreHorizontal, Pencil, UserCheck, UserX } from "lucide-react";
import { z } from "zod";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { FormField } from "@/components/admin/form-field";
import { useApiAction } from "@/components/admin/use-api-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { apiSend } from "@/lib/api/client";
import { admin } from "@/i18n/admin";
import { common } from "@/i18n/common";

const t = admin.students;
const nameSchema = z.object({ name: z.string().trim().min(2, t.validation.name).max(100, t.validation.name) });

type Student = { id: string; name: string; email: string; active: boolean };

export function StudentActions({ student }: { student: Student }) {
  const [dialog, setDialog] = useState<null | "rename" | "deactivate" | "reactivate">(null);
  const { run, pending } = useApiAction();
  const form = useForm<{ name: string }>({ resolver: zodResolver(nameSchema), values: { name: student.name } });
  const url = `/admin/students/${encodeURIComponent(student.id)}`;

  const rename = form.handleSubmit(async ({ name }) => {
    const done = await run(() => apiSend("patch", url, { name }), { success: t.edit.success });
    if (done) setDialog(null);
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`${t.columns.actions}: ${student.name}`} disabled={pending}>
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-64">
          <DropdownMenuItem onSelect={() => setDialog("rename")}>
            <Pencil aria-hidden /> {t.edit.open}
          </DropdownMenuItem>
          {student.active && (
            <DropdownMenuItem
              onSelect={() => run(() => apiSend("post", `${url}/setup-email`), { success: t.resend.success, refresh: false })}
            >
              <Mail aria-hidden /> {t.resend.action}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {student.active ? (
            <DropdownMenuItem variant="destructive" onSelect={() => setDialog("deactivate")}>
              <UserX aria-hidden /> {t.deactivate.action}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setDialog("reactivate")}>
              <UserCheck aria-hidden /> {t.reactivate.action}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === "rename"} onOpenChange={(open) => setDialog(open ? "rename" : null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.edit.title}</DialogTitle>
            <DialogDescription>{student.email}</DialogDescription>
          </DialogHeader>
          <form onSubmit={rename} className="space-y-4" noValidate>
            <FormField label={t.edit.name} error={form.formState.errors.name?.message}>
              <Input autoComplete="off" {...form.register("name")} />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                {common.actions.cancel}
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? common.actions.loading : common.actions.save}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmAction
        open={dialog === "deactivate"}
        onOpenChange={(open) => setDialog(open ? "deactivate" : null)}
        title={t.deactivate.title}
        description={t.deactivate.description(student.name)}
        confirmLabel={t.deactivate.confirm}
        destructive
        onConfirm={() => run(() => apiSend("patch", url, { active: false }), { success: t.deactivate.success })}
      />
      <ConfirmAction
        open={dialog === "reactivate"}
        onOpenChange={(open) => setDialog(open ? "reactivate" : null)}
        title={t.reactivate.title}
        description={t.reactivate.description(student.name)}
        confirmLabel={t.reactivate.confirm}
        onConfirm={() => run(() => apiSend("patch", url, { active: true }), { success: t.reactivate.success })}
      />
    </>
  );
}
