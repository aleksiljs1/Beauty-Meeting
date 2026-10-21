import Link from "next/link";
import type { ReactNode } from "react";
import { adminContent } from "@/i18n/admin-content";

/** Heading block for the content-editor pages (rendered inside the shared admin layout). */
export function ContentPageShell({ title, description, back = true, children }: { title: string; description?: string; back?: boolean; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      {back && (
        <p className="mb-4 text-sm">
          <Link href="/admin/permbajtja" className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            <span aria-hidden>← </span>
            {adminContent.backToContent}
          </Link>
        </p>
      )}
      <header className="mb-8">
        <h1 className="text-3xl sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-muted-foreground">{description}</p>}
      </header>
      {children}
    </div>
  );
}
