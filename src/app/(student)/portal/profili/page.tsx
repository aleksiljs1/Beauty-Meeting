import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { portalText } from "@/i18n/portal";
import { requirePageUser } from "@/server/auth/session";

const t = portalText.profile;

export const metadata: Metadata = { title: t.metaTitle };

export default async function ProfilePage() {
  const user = await requirePageUser("student");
  return (
    <div className="grid max-w-2xl gap-8">
      <h1 className="text-3xl sm:text-4xl">{t.title}</h1>

      <section aria-labelledby="account-heading" className="grid gap-4 rounded-xl border bg-card p-5 sm:p-6">
        <h2 id="account-heading" className="text-2xl">
          {t.accountTitle}
        </h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">{t.name}</dt>
            <dd className="font-medium break-words">{user.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t.email}</dt>
            <dd className="font-medium break-all">{user.email}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">{t.emailNote}</p>
      </section>

      <section aria-labelledby="password-heading" className="grid gap-4 rounded-xl border bg-card p-5 sm:p-6">
        <div>
          <h2 id="password-heading" className="text-2xl">
            {t.passwordTitle}
          </h2>
          <p className="text-sm text-muted-foreground">{t.passwordDescription}</p>
        </div>
        <ChangePasswordForm />
      </section>

      <section aria-labelledby="signout-heading" className="grid gap-3 rounded-xl border bg-card p-5 sm:p-6">
        <div>
          <h2 id="signout-heading" className="text-2xl">
            {t.signOutTitle}
          </h2>
          <p className="text-sm text-muted-foreground">{t.signOutDescription}</p>
        </div>
        <div>
          <SignOutButton />
        </div>
      </section>
    </div>
  );
}
