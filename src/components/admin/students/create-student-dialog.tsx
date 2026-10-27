"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { CheckList } from "@/components/admin/check-list";
import { FormField } from "@/components/admin/form-field";
import { ImportStudentsPanel } from "@/components/admin/students/import-students-panel";
import { useApiAction } from "@/components/admin/use-api-action";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

export function CreateStudentDialog({ defaultOpen = false, courses }: { defaultOpen?: boolean; courses: { id: string; title: string }[] }) {
  const [open, setOpen] = useState(defaultOpen);
  const [mode, setMode] = useState<"single" | "import">("single");
  const [courseIds, setCourseIds] = useState<Set<string>>(new Set());
  const [addToUpcoming, setAddToUpcoming] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { run } = useApiAction();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: "", email: "" } });

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) setMode("single");
    if (!next && searchParams.has("krijo")) {
      const params = new URLSearchParams(searchParams);
      params.delete("krijo");
      router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false });
    }
  }

  const submit = form.handleSubmit(async (values) => {
    const body = { ...values, courseIds: [...courseIds], addToUpcoming };
    const result = await run(() => apiSend<{ student: { email: string }; mailSent: boolean; lessonsAdded: number }>("post", "/admin/students", body));
    if (!result) return;
    const lessons = result.lessonsAdded ? ` ${t.create.lessonsAdded(result.lessonsAdded)}` : "";
    if (result.mailSent) toast.success(t.create.success(result.student.email) + lessons);
    else toast.warning(t.create.mailFailed + lessons);
    form.reset();
    setCourseIds(new Set());
    setAddToUpcoming(true);
    changeOpen(false);
  });

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden /> {t.create.open}
        </Button>
      </DialogTrigger>
      <DialogContent className={mode === "import" ? "sm:max-w-2xl" : "sm:max-w-md"}>
        <DialogHeader>
          <DialogTitle>{t.create.title}</DialogTitle>
          <DialogDescription>{t.create.description}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={mode === "single" ? "default" : "outline"} onClick={() => setMode("single")}>
            Shto një student
          </Button>
          <Button type="button" size="sm" variant={mode === "import" ? "default" : "outline"} onClick={() => setMode("import")}>
            Importo nga Excel
          </Button>
        </div>
        {mode === "import" ? (
          <ImportStudentsPanel
            courses={courses}
            onCancel={() => setMode("single")}
            onImported={() => {
              changeOpen(false);
              router.refresh();
            }}
          />
        ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormField label={t.create.name} error={form.formState.errors.name?.message}>
            <Input autoComplete="off" {...form.register("name")} />
          </FormField>
          <FormField label={t.create.email} error={form.formState.errors.email?.message}>
            <Input type="email" autoComplete="off" inputMode="email" {...form.register("email")} />
          </FormField>
          {courses.length > 0 && (
            <CheckList
              legend={t.courses.field}
              items={courses.map((c) => ({ id: c.id, label: c.title }))}
              selected={courseIds}
              onChange={setCourseIds}
              footer={
                <>
                  <p className="text-xs text-muted-foreground">{t.courses.hint}</p>
                  {courseIds.size > 0 && (
                    <label className="flex items-start gap-2 pt-1 text-sm">
                      <Checkbox className="mt-0.5" checked={addToUpcoming} onCheckedChange={(checked) => setAddToUpcoming(checked === true)} />
                      <span>{t.courses.addToUpcoming}</span>
                    </label>
                  )}
                </>
              }
            />
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => changeOpen(false)}>
              {common.actions.cancel}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? common.actions.loading : t.create.submit}
            </Button>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
