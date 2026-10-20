"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { FormField } from "@/components/admin/form-field";
import { useApiAction } from "@/components/admin/use-api-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiSend } from "@/lib/api/client";
import { admin } from "@/i18n/admin";
import { common } from "@/i18n/common";

const t = admin.students;

const schema = z.object({
  name: z.string().trim().min(2, t.validation.name).max(100, t.validation.name),
  email: z.email(t.validation.email).max(200, t.validation.email),
});
type Values = z.infer<typeof schema>;

export function CreateStudentDialog({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { run } = useApiAction();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: "", email: "" } });

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next && searchParams.has("krijo")) {
      const params = new URLSearchParams(searchParams);
      params.delete("krijo");
      router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false });
    }
  }

  const submit = form.handleSubmit(async (values) => {
    const result = await run(() => apiSend<{ student: { email: string }; mailSent: boolean }>("post", "/admin/students", values));
    if (!result) return;
    if (result.mailSent) toast.success(t.create.success(result.student.email));
    else toast.warning(t.create.mailFailed);
    form.reset();
    changeOpen(false);
  });

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden /> {t.create.open}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.create.title}</DialogTitle>
          <DialogDescription>{t.create.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormField label={t.create.name} error={form.formState.errors.name?.message}>
            <Input autoComplete="off" {...form.register("name")} />
          </FormField>
          <FormField label={t.create.email} error={form.formState.errors.email?.message}>
            <Input type="email" autoComplete="off" inputMode="email" {...form.register("email")} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => changeOpen(false)}>
              {common.actions.cancel}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? common.actions.loading : t.create.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
