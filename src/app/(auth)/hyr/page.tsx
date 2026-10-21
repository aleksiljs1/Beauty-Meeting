import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { authText } from "@/i18n/auth";
import { postLoginDestination, safeNextPath } from "@/lib/safe-next";
import { getPageUser } from "@/server/auth/session";

export const metadata: Metadata = { title: authText.login.metaTitle, robots: { index: false } };

export default async function LoginPage({ searchParams }: PageProps<"/hyr">) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(next);

  // Already signed in: go straight on.
  const user = await getPageUser();
  if (user) redirect(postLoginDestination(user.role, nextPath));

  return (
    <div className="grid gap-6">
      <div className="text-center">
        <h1 className="text-3xl">{authText.login.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{authText.login.description}</p>
      </div>
      <LoginForm next={nextPath} />
      <p className="text-center text-xs text-muted-foreground">{authText.login.noAccount}</p>
    </div>
  );
}
