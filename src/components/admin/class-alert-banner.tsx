"use client";

import { ArrowRight, Video } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CoverImage } from "@/components/cover-image";
import { Button } from "@/components/ui/button";
import { admin } from "@/i18n/admin";
import { formatLead } from "@/lib/admin-reminders";
import { apiGet } from "@/lib/api/client";
import { formatTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { ClassAlert } from "@/server/queries/admin";

const t = admin.classAlert;
const REFRESH_MS = 60_000;
const TICK_MS = 15_000;

type Alerts = { leadMinutes: number; zoomLive: boolean; alerts: ClassAlert[] };

/** Re-renders every few seconds so the countdown stays current between refreshes. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * On every admin page: the class running now, or about to start within the admin's reminder
 * time (Cilësimet), with one click into it. Refreshed every minute and whenever the tab comes
 * back into view.
 */
export function ClassAlertBanner() {
  const [data, setData] = useState<Alerts | null>(null);
  const now = useNow();

  const refresh = useCallback(() => {
    apiGet<Alerts>("/admin/class-alerts")
      .then(setData)
      .catch(() => undefined); // offline or signed out: keep what we have, the shell handles sign-out
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  if (!data?.alerts.length) return null;
  const [first, ...others] = data.alerts;

  return (
    <section aria-label={t.region} aria-live="polite" className="mb-6 grid gap-2">
      <ClassAlertCard alert={first} zoomLive={data.zoomLive} now={now} />
      {others.map((alert) => (
        <ClassAlertCard key={alert.id} alert={alert} zoomLive={data.zoomLive} now={now} compact />
      ))}
    </section>
  );
}

function ClassAlertCard({ alert, zoomLive, now, compact = false }: { alert: ClassAlert; zoomLive: boolean; now: number; compact?: boolean }) {
  const start = new Date(alert.scheduledStartAt);
  const minutesLeft = Math.ceil((start.getTime() - now) / 60_000);
  const status = alert.live ? t.live : minutesLeft <= 0 ? t.startsNow : t.startsIn(formatTime(start), formatLead(minutesLeft));
  // The host page starts the real Zoom class; drafts and demo classes are run from the lesson page.
  const canHost = zoomLive && !alert.isDemo && alert.publication === "PUBLISHED";
  const lessonHref = `/admin/mesimet/${alert.id}`;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between",
        alert.live ? "border-live/60 bg-live/10" : "border-rose/60 bg-rose/10",
        compact && "py-3",
      )}
    >
      <div className="flex min-w-0 items-center gap-4">
        {!compact && <CoverImage src={alert.coverSrc} alt="" title={alert.title} sizes="128px" className="hidden h-16 w-28 shrink-0 rounded-md border sm:block" />}
        <span aria-hidden className="relative flex size-3 shrink-0 self-start sm:self-center">
          <span className={cn("absolute inline-flex size-full rounded-full opacity-60 motion-safe:animate-ping", alert.live ? "bg-live" : "bg-rose")} />
          <span className={cn("relative inline-flex size-3 rounded-full", alert.live ? "bg-live" : "bg-rose")} />
        </span>
        <div className="min-w-0">
          <p className={cn("text-xs font-medium tracking-wide uppercase", alert.live ? "text-live" : "text-rose-deep")}>{status}</p>
          <p className={cn("font-heading", compact ? "text-lg" : "text-2xl")}>{alert.title}</p>
          {alert.publication === "DRAFT" && <p className="text-sm text-destructive">{t.draft}</p>}
          {alert.isDemo && <p className="text-sm text-muted-foreground">{t.demo}</p>}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {canHost && (
          // Its own tab, like the lesson page's button: the call keeps running while the panel is used.
          <Button asChild size={compact ? "default" : "lg"} className={alert.live ? "bg-live text-white hover:bg-live/90" : undefined}>
            <a href={`/klasa/${alert.id}`} target={`klasa-${alert.id}`} rel="noopener">
              <Video aria-hidden />
              {alert.live ? t.rejoin : t.start}
            </a>
          </Button>
        )}
        <Button asChild variant={canHost ? "outline" : "default"} size={compact ? "default" : "lg"}>
          <Link href={lessonHref}>
            {t.open}
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    </div>
  );
}
