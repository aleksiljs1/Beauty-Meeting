"use client";

import { Clock3, Radio, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { dismissLiveAlert, isDismissed, useLiveFeed, type FeedNotification } from "@/hooks/use-live-feed";
import { portalText } from "@/i18n/portal";
import { cn } from "@/lib/utils";

const t = portalText.alert;

function pickAlert(notifications: FeedNotification[], dismissed: ReadonlySet<string>, pathname: string | null) {
  const candidates = notifications.filter(
    (n) =>
      n.active &&
      n.lessonId &&
      !isDismissed(n, dismissed) &&
      (n.type === "LESSON_LIVE" || n.type === "LESSON_STARTING_SOON") &&
      // Already on that lesson's page: the classroom itself shows the state.
      pathname !== `/portal/mesimet/${n.lessonId}`,
  );
  return candidates.find((n) => n.type === "LESSON_LIVE") ?? candidates.find((n) => n.type === "LESSON_STARTING_SOON") ?? null;
}

/**
 * Self-contained "class has started" pop-up. Mount it on any page: for anonymous visitors it
 * makes no requests (see useLiveFeed). It never steals focus, plays no sound, never joins on
 * its own and never touches camera/microphone. "Bashkohu" only navigates to the lesson page,
 * where the server re-checks access; it never carries meeting links or credentials.
 */
export function LiveClassAlert({ aboveBottomNav = false }: { aboveBottomNav?: boolean }) {
  const { feed, dismissed } = useLiveFeed();
  const pathname = usePathname();
  const headingId = useId();
  const alert = feed ? pickAlert(feed.notifications, dismissed, pathname) : null;

  const isLive = alert?.type === "LESSON_LIVE";
  const lessonHref = alert?.lessonId ? `/portal/mesimet/${alert.lessonId}` : "/portal";

  return (
    <div
      role="region"
      aria-live="polite"
      aria-label={alert ? undefined : t.regionLabel}
      aria-labelledby={alert ? headingId : undefined}
      className={cn(
        "pointer-events-none fixed inset-x-0 z-40 flex justify-center px-3 md:inset-x-auto md:right-6 md:bottom-6 md:justify-end md:px-0",
        aboveBottomNav ? "bottom-[calc(env(safe-area-inset-bottom)+4.75rem)]" : "bottom-[calc(env(safe-area-inset-bottom)+1rem)]",
      )}
    >
      {alert ? (
        <section
          key={alert.id}
          className="pointer-events-auto w-full max-w-sm rounded-lg border bg-card p-4 shadow-lg ring-1 ring-foreground/5 animate-in fade-in-0 slide-in-from-bottom-2"
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={
                isLive
                  ? "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-live/10 text-live"
                  : "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-rose-deep"
              }
            >
              {isLive ? <Radio className="size-4" /> : <Clock3 className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <h2 id={headingId} className="font-heading text-lg leading-tight">
                {isLive ? t.liveTitle : t.soonTitle}
              </h2>
              <p className="mt-0.5 truncate text-sm font-medium">{alert.lessonTitle}</p>
              <p className="text-xs text-muted-foreground">{isLive ? t.liveBody : t.soonBody}</p>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label={t.close} onClick={() => void dismissLiveAlert(alert.id)}>
              <X />
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="lg" onClick={() => void dismissLiveAlert(alert.id)}>
              {t.later}
            </Button>
            {alert.canJoin ? (
              <Button asChild size="lg" className={isLive ? "bg-live text-white hover:bg-live/90" : undefined}>
                <Link href={`${lessonHref}?bashkohu=1`}>{t.join}</Link>
              </Button>
            ) : (
              <Button asChild size="lg" variant="secondary">
                <Link href={lessonHref}>{t.view}</Link>
              </Button>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
