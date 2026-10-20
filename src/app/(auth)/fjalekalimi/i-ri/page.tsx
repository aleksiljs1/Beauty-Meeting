import type { Metadata } from "next";
import { InvalidResetLink, ResetPasswordForm } from "@/components/auth/reset-password-form";
import { authText } from "@/i18n/auth";

export const metadata: Metadata = { title: authText.reset.metaTitle, robots: { index: false } };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function NewPasswordPage({ searchParams }: PageProps<"/fjalekalimi/i-ri">) {
  const params = await searchParams;
  const token = first(params.token);
  const setup = first(params.setup) === "1";
  // Better Auth redirects here with ?error=INVALID_TOKEN when an emailed link is unknown/expired.
  const invalid = !!first(params.error) || !token || token.length > 200;

  const title = setup ? authText.reset.setupTitle : authText.reset.title;
  const description = setup ? authText.reset.setupDescription : authText.reset.description;

  return (
    <div className="grid gap-6">
      {invalid ? (
        <InvalidResetLink setup={setup} />
      ) : (
        <>
          <div className="text-center">
            <h1 className="text-3xl">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <ResetPasswordForm token={token} setup={setup} />
        </>
      )}
    </div>
  );
}
