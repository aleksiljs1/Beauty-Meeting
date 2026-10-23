import { publicSite } from "@/i18n/public";
import { cn } from "@/lib/utils";
import type { PublicService } from "@/server/queries/public";
import { EmptyState } from "./primitives";
import { Reveal } from "./reveal";

/**
 * Editorial menu-style list: name and description on the left, optional price on the right.
 * Rows reveal on scroll (staggered per visual row) and a gold hairline grows along the bottom
 * border on hover, the same gesture as the header navigation.
 */
export function ServiceList({ services, compact = false }: { services: PublicService[]; compact?: boolean }) {
  if (services.length === 0) return <EmptyState>{publicSite.services.empty}</EmptyState>;
  return (
    <ul className={cn("grid border-t border-border/80", compact ? "md:grid-cols-2 md:gap-x-14" : "")}>
      {services.map((service, index) => (
        <Reveal
          as="li"
          key={service.id}
          delay={((compact ? Math.floor(index / 2) : index) % 3) * 80}
          className="group relative flex flex-col gap-2 border-b border-border/80 py-6 sm:flex-row sm:items-baseline sm:justify-between sm:gap-8"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -bottom-px h-px origin-left scale-x-0 bg-rose/70 transition-transform duration-500 ease-out group-hover:scale-x-100"
          />
          <div className="min-w-0">
            <h3 className="text-2xl leading-snug transition-colors duration-300 group-hover:text-rose-deep">{service.title}</h3>
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
        </Reveal>
      ))}
    </ul>
  );
}
