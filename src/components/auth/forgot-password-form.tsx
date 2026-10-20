"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { authText } from "@/i18n/auth";
import { requestPasswordReset, type AuthFailure } from "@/lib/api/auth";
import { FormField } from "./form-field";

const t = authText;

const schema = z.object({
  email: z.string().trim().min(1, t.validation.emailRequired).pipe(z.email(t.validation.emailInvalid)),
});
type Values = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  const onSubmit = handleSubmit(async ({ email }) => {
    setFailure(null);
    const result = await requestPasswordReset(email);
    // Same neutral confirmation whether or not the account exists; only transport problems differ.
    if (!result.ok && (result.failure === "NETWORK" || result.failure === "RATE_LIMITED")) {
      setFailure(result.failure);
      return;
    }
    setDone(true);
  });

  if (done) {
    return (
      <div role="status" className="grid gap-4 text-center">
        <MailCheck aria-hidden="true" className="mx-auto size-8 text-rose-deep" />
        <h2 className="text-2xl">{t.forgot.doneTitle}</h2>
        <p className="text-sm text-muted-foreground">{t.forgot.doneBody}</p>
        <Button asChild variant="outline" size="lg" className="h-10">
          <Link href="/hyr">{t.forgot.backToLogin}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormField label={t.fields.email} type="email" autoComplete="email" inputMode="email" error={errors.email?.message} {...register("email")} />
      <div aria-live="polite">
        {failure ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {t.failures[failure]}
          </p>
        ) : null}
      </div>
      <Button type="submit" size="lg" className="h-10" disabled={isSubmitting}>
        {isSubmitting ? t.forgot.submitting : t.forgot.submit}
      </Button>
      <p className="text-center text-sm">
        <Link href="/hyr" className="text-rose-deep underline-offset-4 hover:underline">
          {t.forgot.backToLogin}
        </Link>
      </p>
    </form>
  );
}
