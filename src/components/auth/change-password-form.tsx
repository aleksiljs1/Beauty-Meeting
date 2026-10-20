"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { authText } from "@/i18n/auth";
import { portalText } from "@/i18n/portal";
import { changePassword } from "@/lib/api/auth";
import { FormField } from "./form-field";
import { newPasswordField } from "./password-schema";

const t = authText;
const p = portalText.profile;

const schema = z
  .object({ current: z.string().min(1, t.validation.passwordRequired), password: newPasswordField, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: t.validation.passwordsDontMatch })
  .refine((v) => v.password !== v.current, { path: ["password"], message: p.sameAsCurrent });
type Values = z.infer<typeof schema>;

export function ChangePasswordForm() {
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { current: "", password: "", confirm: "" } });

  const onSubmit = handleSubmit(async ({ current, password }) => {
    setMessage(null);
    const result = await changePassword(current, password);
    if (result.ok) {
      reset();
      setMessage({ kind: "success", text: p.success });
      toast.success(p.success);
      return;
    }
    // Better Auth rejects a wrong current password with 400/401.
    const failure = result.failure ?? "UNKNOWN";
    const text = failure === "INVALID_CREDENTIALS" || failure === "UNKNOWN" ? p.wrongCurrent : t.failures[failure];
    setMessage({ kind: "error", text });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-md gap-4">
      <FormField label={t.fields.currentPassword} type="password" autoComplete="current-password" error={errors.current?.message} {...register("current")} />
      <FormField
        label={t.fields.newPassword}
        type="password"
        autoComplete="new-password"
        hint={t.fields.passwordHint}
        error={errors.password?.message}
        {...register("password")}
      />
      <FormField label={t.fields.confirmPassword} type="password" autoComplete="new-password" error={errors.confirm?.message} {...register("confirm")} />
      <div aria-live="polite">
        {message ? (
          <p
            role={message.kind === "error" ? "alert" : "status"}
            className={
              message.kind === "error"
                ? "rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                : "rounded-md border bg-secondary px-3 py-2 text-sm"
            }
          >
            {message.text}
          </p>
        ) : null}
      </div>
      <div>
        <Button type="submit" size="lg" className="h-10" disabled={isSubmitting}>
          {isSubmitting ? p.submitting : p.submit}
        </Button>
      </div>
    </form>
  );
}
