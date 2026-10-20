"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { authText } from "@/i18n/auth";
import { resetPassword, type AuthFailure } from "@/lib/api/auth";
import { FormField } from "./form-field";
import { newPasswordSchema } from "./password-schema";

const t = authText;
type Values = z.infer<typeof newPasswordSchema>;

export function InvalidResetLink({ setup }: { setup: boolean }) {
  return (
    <div role="alert" className="grid gap-4 text-center">
      <TriangleAlert aria-hidden="true" className="mx-auto size-8 text-rose-deep" />
      <h2 className="text-2xl">{t.reset.invalidTitle}</h2>
      <p className="text-sm text-muted-foreground">{setup ? t.reset.invalidSetupBody : t.reset.invalidBody}</p>
      <Button asChild size="lg" className="h-10">
        <Link href="/fjalekalimi/harruar">{t.reset.requestNew}</Link>
      </Button>
    </div>
  );
}

export function ResetPasswordForm({ token, setup }: { token: string; setup: boolean }) {
  const [state, setState] = useState<"form" | "done" | "invalid">("form");
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(newPasswordSchema), defaultValues: { password: "", confirm: "" } });

  const onSubmit = handleSubmit(async ({ password }) => {
    setFailure(null);
    const result = await resetPassword(token, password);
    if (result.ok) return setState("done");
    // Better Auth answers an unknown/expired/used token with a 400 ("UNKNOWN" here).
    if (result.failure === "UNKNOWN" || result.failure === "INVALID_CREDENTIALS") return setState("invalid");
    setFailure(result.failure ?? "UNKNOWN");
  });

  if (state === "invalid") return <InvalidResetLink setup={setup} />;

  if (state === "done") {
    return (
      <div role="status" className="grid gap-4 text-center">
        <CircleCheck aria-hidden="true" className="mx-auto size-8 text-rose-deep" />
        <h2 className="text-2xl">{setup ? t.reset.setupDoneTitle : t.reset.doneTitle}</h2>
        <p className="text-sm text-muted-foreground">{t.reset.doneBody}</p>
        <Button asChild size="lg" className="h-10">
          <Link href="/hyr">{t.reset.goToLogin}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormField
        label={t.fields.newPassword}
        type="password"
        autoComplete="new-password"
        hint={t.fields.passwordHint}
        error={errors.password?.message}
        {...register("password")}
      />
      <FormField
        label={t.fields.confirmPassword}
        type="password"
        autoComplete="new-password"
        error={errors.confirm?.message}
        {...register("confirm")}
      />
      <div aria-live="polite">
        {failure ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {t.failures[failure]}
          </p>
        ) : null}
      </div>
      <Button type="submit" size="lg" className="h-10" disabled={isSubmitting}>
        {isSubmitting ? t.reset.submitting : setup ? t.reset.setupSubmit : t.reset.submit}
      </Button>
    </form>
  );
}
