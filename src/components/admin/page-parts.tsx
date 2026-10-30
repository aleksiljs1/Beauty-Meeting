import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { admin } from "@/i18n/admin";
import { common } from "@/i18n/common";
import { pageItems } from "@/lib/pagination";
import { cn } from "@/lib/utils";

/** Small presentational pieces shared by admin pages (server-compatible). */

export function PageHeader({ title, intro, actions }: { title: string; intro?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-3xl font-medium">{title}</h1>
        {intro && <p className="max-w-2xl text-sm text-muted-foreground">{intro}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground", className)}>
      <Inbox className="size-5" aria-hidden />
      <p>{children}</p>
    </div>
  );
}

/** Previous · 1 · … · 20 · [21] · 22 · … · 50 · Next */
export function Pagination({ page, pageCount, href }: { page: number; pageCount: number; href: (page: number) => string }) {
  if (pageCount <= 1) return null;
  const t = admin.pagination;
  return (
    <nav className="flex flex-wrap items-center justify-center gap-1 pt-2 text-sm" aria-label={t.page(page, pageCount)}>
      {page > 1 && (
        <Button variant="outline" size="sm" asChild>
          <Link href={href(page - 1)}>
            <ChevronLeft aria-hidden /> <span className="hidden sm:inline">{t.previous}</span>
            <span className="sr-only sm:hidden">{t.previous}</span>
          </Link>
        </Button>
      )}
      {pageItems(page, pageCount).map((item, index) =>
        item === "gap" ? (
          <span key={`gap-${index}`} className="px-1 text-muted-foreground" aria-hidden>
            …
          </span>
        ) : (
          <Button key={item} variant={item === page ? "default" : "ghost"} size="sm" className="min-w-8 tabular-nums" asChild>
            <Link href={href(item)} aria-current={item === page ? "page" : undefined} aria-label={t.page(item, pageCount)}>
              {item}
            </Link>
          </Button>
        ),
      )}
      {page < pageCount && (
        <Button variant="outline" size="sm" asChild>
          <Link href={href(page + 1)}>
            <span className="hidden sm:inline">{t.next}</span>
            <span className="sr-only sm:hidden">{t.next}</span> <ChevronRight aria-hidden />
          </Link>
        </Button>
      )}
    </nav>
  );
}

type PublicationValue = keyof typeof common.publication;

export function PublicationBadge({ publication }: { publication: PublicationValue }) {
  const tone: Record<PublicationValue, string> = {
    DRAFT: "border-border bg-muted text-muted-foreground",
    PUBLISHED: "border-transparent bg-accent text-accent-foreground",
    ARCHIVED: "border-border bg-transparent text-muted-foreground",
    CANCELLED: "border-transparent bg-destructive/10 text-destructive",
  };
  return (
    <Badge variant="outline" className={tone[publication]}>
      {common.publication[publication]}
    </Badge>
  );
}

type MeetingValue = keyof typeof admin.lessons.meetingStatus;

export function MeetingBadge({ status }: { status: MeetingValue }) {
  if (status === "LIVE") {
    return (
      <Badge className="bg-live text-white">
        <span className="size-1.5 rounded-full bg-white" aria-hidden /> {admin.lessons.meetingStatus.LIVE}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={status === "ERROR" ? "text-destructive" : "text-muted-foreground"}>
      {admin.lessons.meetingStatus[status]}
    </Badge>
  );
}

export function DemoBadge() {
  return (
    <Badge variant="outline" className="border-rose text-rose-deep">
      {admin.lessons.demoBadge}
    </Badge>
  );
}

/** A link styled as a filter pill; `active` marks the current filter. */
export function FilterChip({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition-colors duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:border-rose/50 hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

export function SectionCard({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-md border bg-card p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-medium">{title}</h2>
          {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
