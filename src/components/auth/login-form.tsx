"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { refreshLiveFeed } from "@/hooks/use-live-feed";
import { authText } from "@/i18n/auth";
import { signIn, signOut, type AuthFailure } from "@/lib/api/auth";
import { apiGet } from "@/lib/api/client";
import { setSessionHint } from "@/lib/api/session-hint";
import { postLoginDestination } from "@/lib/safe-next";
import { FormField } from "./form-field";

const t = authText;

const schema = z.object({
  email: z.string().trim().min(1, t.validation.emailRequired).pipe(z.email(t.validation.emailInvalid)),
  password: z.string().min(1, t.validation.passwordRequired).max(128, t.validation.passwordTooLong),
});
type Values = z.infer<typeof schema>;

type Me = { id: string; role: "admin" | "student" };

export function LoginForm({ next }: { next: string | null }) {
  const router = useRouter();
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setFailure(null);
    const result = await signIn(email, password);
    if (!result.ok) {
      setFailure(result.failure);
      return;
    }
    try {
      const me = await apiGet<Me>("/me");
      setSessionHint();
      refreshLiveFeed();
      setRedirecting(true);
      router.replace(postLoginDestination(me.role, next));
      router.refresh();
    } catch {
      // Signed in but the profile couldn't be read (e.g. deactivated meanwhile): don't leave a half session.
      await signOut().catch(() => undefined);
      setFailure("UNKNOWN");
    }
  });

  const busy = isSubmitting || redirecting;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4" aria-describedby={failure ? "login-failure" : undefined}>
      <FormField label={t.fields.email} type="email" autoComplete="email" inputMode="email" error={errors.email?.message} {...register("email")} />
      <FormField
        label={t.fields.password}
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register("password")}
      />
      <div aria-live="polite" className="min-h-0">
        {failure ? (
          <p id="login-failure" role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {t.failures[failure]}
          </p>
        ) : null}
        {redirecting ? <p className="text-sm text-muted-foreground">{t.login.redirecting}</p> : null}
      </div>
      <Button type="submit" size="lg" className="h-10" disabled={busy}>
        {busy ? t.login.submitting : t.login.submit}
      </Button>
      <p className="text-center text-sm">
        <Link href="/fjalekalimi/harruar" className="text-rose-deep underline-offset-4 hover:underline">
          {t.login.forgot}
        </Link>
      </p>
    </form>
  );
}
