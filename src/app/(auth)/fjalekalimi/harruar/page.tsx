import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { authText } from "@/i18n/auth";

export const metadata: Metadata = { title: authText.forgot.metaTitle, robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <div className="grid gap-6">
      <div className="text-center">
        <h1 className="text-3xl">{authText.forgot.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{authText.forgot.description}</p>
      </div>
      <ForgotPasswordForm />
    </div>
  );
}
