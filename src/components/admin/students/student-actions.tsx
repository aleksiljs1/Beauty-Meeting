"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { GraduationCap, Mail, MoreHorizontal, Pencil, Trash2, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { CheckList } from "@/components/admin/check-list";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { FormField } from "@/components/admin/form-field";
import { StudentProfileFields } from "@/components/admin/students/student-profile-fields";
import { useApiAction } from "@/components/admin/use-api-action";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { apiSend } from "@/lib/api/client";
import { studentProfileSchema, type StudentProfileInput } from "@/lib/student-profile";
import { admin } from "@/i18n/admin";
import { common } from "@/i18n/common";

const t = admin.students;
const detailsSchema = z.object({ name: z.string().trim().min(2, t.validation.name).max(100, t.validation.name), profile: studentProfileSchema });

type Student = { id: string; name: string; email: string; active: boolean; courses: { id: string }[]; profile: StudentProfileInput };
type Course = { id: string; title: string };

export function StudentActions({ student, courses }: { student: Student; courses: Course[] }) {
  const [dialog, setDialog] = useState<null | "rename" | "email" | "courses" | "deactivate" | "reactivate" | "delete">(null);
  const { run, pending } = useApiAction();
  const router = useRouter();
  const form = useForm<z.infer<typeof detailsSchema>>({ resolver: zodResolver(detailsSchema), values: { name: student.name, profile: student.profile } });
  const url = `/admin/students/${encodeURIComponent(student.id)}`;

  const saveDetails = form.handleSubmit(async (values) => {
    const done = await run(() => apiSend("patch", url, values), { success: t.edit.success });
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
          <DropdownMenuItem onSelect={() => setDialog("email")}>
            <Mail aria-hidden /> {t.email.open}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("courses")}>
            <GraduationCap aria-hidden /> {t.courses.open}
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
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
            <Trash2 aria-hidden /> {t.delete.action}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === "rename"} onOpenChange={(open) => setDialog(open ? "rename" : null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.edit.title}</DialogTitle>
            <DialogDescription>{student.email}</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveDetails} className="space-y-4" noValidate>
            <FormField label={t.edit.name} error={form.formState.errors.name?.message}>
              <Input autoComplete="off" {...form.register("name")} />
            </FormField>
            <StudentProfileFields form={form} />
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

      {dialog === "courses" && <CoursesDialog student={student} courses={courses} onClose={() => setDialog(null)} />}

      <EmailEditDialog open={dialog === "email"} student={student} onClose={() => setDialog(null)} />

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
      <ConfirmAction
        open={dialog === "delete"}
        onOpenChange={(open) => setDialog(open ? "delete" : null)}
        title={t.delete.title}
        description={t.delete.description(student.name)}
        confirmLabel={t.delete.confirm}
        destructive
        onConfirm={async () => {
          const result = await run(() => apiSend("delete", url), { refresh: false });
          if (!result) return false;
          toast.success(t.delete.success);
          router.refresh();
          return true;
        }}
      />
    </>
  );
}

const emailSchema = z.object({ email: z.email(t.validation.email).max(200, t.validation.email) });

function EmailEditDialog({ open, student, onClose }: { open: boolean; student: Student; onClose: () => void }) {
  const router = useRouter();
  const { run } = useApiAction();
  const form = useForm<{ email: string }>({ resolver: zodResolver(emailSchema), values: { email: student.email } });

  const submit = form.handleSubmit(async ({ email }) => {
    const result = await run<{ emailChanged: boolean; mailSent: boolean }>(
      () => apiSend("patch", `/admin/students/${encodeURIComponent(student.id)}`, { email }),
      { refresh: false },
    );
    if (!result) return;
    if (!result.emailChanged) toast.info(t.email.unchanged);
    else if (result.mailSent) toast.success(t.email.success);
    else toast.warning(student.active ? t.email.mailFailed : t.email.inactive);
    onClose();
    if (result.emailChanged) router.refresh();
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.email.title}</DialogTitle>
          <DialogDescription>{t.email.description(student.name)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormField label={t.email.label} error={form.formState.errors.email?.message}>
            <Input type="email" autoComplete="off" inputMode="email" {...form.register("email")} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {common.actions.cancel}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting || !form.formState.isDirty}>
              {form.formState.isSubmitting ? common.actions.loading : common.actions.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CoursesDialog({ student, courses, onClose }: { student: Student; courses: Course[]; onClose: () => void }) {
  const initial = new Set(student.courses.map((c) => c.id));
  const [selected, setSelected] = useState<Set<string>>(initial);
  const [addToUpcoming, setAddToUpcoming] = useState(true);
  const { run, pending } = useApiAction();
  const adding = [...selected].some((id) => !initial.has(id));
  const changed = adding || [...initial].some((id) => !selected.has(id));

  async function save() {
    const result = await run(() =>
      apiSend<{ lessonsAdded: number }>("put", `/admin/students/${encodeURIComponent(student.id)}/courses`, {
        courseIds: [...selected],
        addToUpcoming: adding && addToUpcoming,
      }),
    );
    if (!result) return;
    toast.success(result.lessonsAdded ? t.courses.savedWithLessons(result.lessonsAdded) : t.courses.saved);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.courses.title}</DialogTitle>
          <DialogDescription>{t.courses.description(student.name)}</DialogDescription>
        </DialogHeader>
        {courses.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.courses.none}</p>
        ) : (
          <CheckList
            legend={t.courses.field}
            items={courses.map((c) => ({ id: c.id, label: c.title }))}
            selected={selected}
            onChange={setSelected}
            footer={
              <div className="space-y-2 pt-1">
                {adding && student.active && (
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox className="mt-0.5" checked={addToUpcoming} onCheckedChange={(checked) => setAddToUpcoming(checked === true)} />
                    <span>
                      {t.courses.addToUpcoming}
                      <span className="block text-xs text-muted-foreground">{t.courses.addToUpcomingHint}</span>
                    </span>
                  </label>
                )}
                <p className="text-xs text-muted-foreground">{t.courses.removeNote}</p>
              </div>
            }
          />
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {common.actions.cancel}
          </Button>
          <Button onClick={save} disabled={pending || !changed}>
            {pending ? common.actions.loading : common.actions.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
