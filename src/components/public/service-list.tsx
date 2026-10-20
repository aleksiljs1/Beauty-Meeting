import { publicSite } from "@/i18n/public";
import { cn } from "@/lib/utils";
import type { PublicService } from "@/server/queries/public";
import { EmptyState } from "./primitives";

/** Editorial menu-style list: name and description on the left, optional price on the right. */
export function ServiceList({ services, compact = false }: { services: PublicService[]; compact?: boolean }) {
  if (services.length === 0) return <EmptyState>{publicSite.services.empty}</EmptyState>;
  return (
    <ul className={cn("grid border-t border-border/80", compact ? "md:grid-cols-2 md:gap-x-14" : "")}>
      {services.map((service) => (
        <li key={service.id} className="flex flex-col gap-2 border-b border-border/80 py-6 sm:flex-row sm:items-baseline sm:justify-between sm:gap-8">
          <div className="min-w-0">
            <h3 className="text-2xl leading-snug">{service.title}</h3>
            {service.description && (
              <p className={cn("mt-2 leading-relaxed whitespace-pre-line text-muted-foreground", compact && "line-clamp-2")}>{service.description}</p>
            )}
          </div>
          {service.priceText && (
            <p className="shrink-0 text-sm font-medium text-rose-deep tabular-nums sm:text-right">
              <span className="sr-only">{publicSite.services.priceLabel}: </span>
              {service.priceText}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
