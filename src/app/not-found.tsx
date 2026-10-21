import type { Metadata } from "next";
import Link from "next/link";
import { publicSite } from "@/i18n/public";

export const metadata: Metadata = { title: publicSite.notFound.title };

/** App-wide 404 for unmatched URLs (renders in the root layout only). */
export default function NotFound() {
  return (
    <main className="flex flex-1 items-center">
      <div className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <p className="text-xs font-medium tracking-[0.18em] text-rose-deep uppercase">404</p>
        <h1 className="mt-4 text-4xl sm:text-5xl">{publicSite.notFound.title}</h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">{publicSite.notFound.body}</p>
        <Link
          href="/"
          className="mt-9 inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/85 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {publicSite.notFound.home}
        </Link>
      </div>
    </main>
  );
}
