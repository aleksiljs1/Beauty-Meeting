"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { publicSite } from "@/i18n/public";

const t = publicSite.error;

/**
 * Albanian fallback for route error boundaries (error.tsx) outside the admin panel and portal,
 * which have their own. Renders inside the root layout, so the theme and fonts are available.
 */
export function RouteError({
  error,
  retry,
  compact = false,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  /** Small centered variant for narrow containers (the sign-in card). */
  compact?: boolean;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  if (compact) {
    return (
      <div role="alert" className="grid gap-3 text-center">
        <h1 className="text-2xl">{t.title}</h1>
        <p className="text-sm text-muted-foreground">{t.body}</p>
        <div className="mt-2">
          <Button size="lg" onClick={() => retry()}>
            {t.retry}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div role="alert" className="flex flex-1 items-center">
      <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <p className="text-xs font-medium tracking-[0.18em] text-rose-deep uppercase">{t.eyebrow}</p>
        <h1 className="mt-4 text-4xl sm:text-5xl">{t.title}</h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">{t.body}</p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button size="lg" className="h-11 px-6" onClick={() => retry()}>
            {t.retry}
          </Button>
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-border px-6 text-sm font-medium transition-colors hover:border-rose/50 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {t.home}
          </Link>
        </div>
      </div>
    </div>
  );
}
