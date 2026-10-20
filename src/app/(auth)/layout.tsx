import Link from "next/link";
import { connection } from "next/server";
import { authText } from "@/i18n/auth";
import { getAcademyName } from "@/server/queries/portal";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  await connection(); // render per request: the academy name is admin-editable
  const academyName = await getAcademyName();
  return (
    <div className="flex min-h-dvh flex-1 flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <header className="mb-8 text-center">
          <Link href="/" className="font-heading text-3xl tracking-tight text-foreground">
            {academyName}
          </Link>
          <p className="mt-1 text-xs tracking-[0.2em] text-muted-foreground uppercase">{authText.layout.tagline}</p>
        </header>
        <main className="rounded-xl border bg-card p-6 shadow-sm sm:p-8">{children}</main>
        <p className="mt-6 text-center text-xs">
          <Link href="/" className="text-muted-foreground underline-offset-4 hover:underline">
            {authText.layout.backHome}
          </Link>
        </p>
      </div>
    </div>
  );
}
