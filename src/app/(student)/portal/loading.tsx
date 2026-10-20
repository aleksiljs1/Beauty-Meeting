import { Skeleton } from "@/components/ui/skeleton";
import { portalText } from "@/i18n/portal";

export default function PortalLoading() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <span className="sr-only" role="status">
        {portalText.states.loading}
      </span>
      <Skeleton className="h-10 w-2/3 max-w-sm" />
      <Skeleton className="h-4 w-1/2 max-w-xs" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-52 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
