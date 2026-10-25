"use client";

import { AlertCircle, ExternalLink, LoaderCircle, RefreshCw, Video } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useApiAction } from "@/components/admin/use-api-action";
import { Button } from "@/components/ui/button";
import { ZoomFrame, ZoomFullscreenButton } from "@/components/zoom/zoom-frame";
import type { MeetingStatus } from "@/generated/prisma/enums";
import { isZoomJoinConfig, useZoomFrame } from "@/hooks/use-zoom-frame";
import { admin } from "@/i18n/admin";
import { zoomText } from "@/i18n/zoom";
import { ApiClientError, apiSend } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const t = zoomText.admin;
const r = zoomText.room;

type PanelId = "materials" | "students" | "invitations";
type View = "class" | PanelId;
const PANELS: { id: PanelId; label: string }[] = [
  { id: "materials", label: admin.lessons.tabs.materials },
  { id: "students", label: admin.lessons.tabs.students },
  { id: "invitations", label: admin.lessons.tabs.invitations },
];

/**
 * Host classroom: the meeting beside the lesson tools. Starts the meeting as soon as the page
 * opens, marks the lesson live once the host is in (without waiting for the webhook) and warns
 * before the tab closes. The meeting and the panels are siblings and the meeting is never
 * re-keyed; on phones the meeting is hidden with CSS (not unmounted) while a panel is shown.
 */
export function HostRoom({
  lessonId,
  title,
  meetingStatus,
  panels,
}: {
  lessonId: string;
  title: string;
  meetingStatus: MeetingStatus;
  panels: Record<PanelId, ReactNode>;
}) {
  const { run, pending } = useApiAction();
  const zoom = useZoomFrame(t.hostError);
  const startZoom = zoom.start;
  const failZoom = zoom.fail;
  const [authorizing, setAuthorizing] = useState(false);
  const [panel, setPanel] = useState<PanelId>("materials");
  const [view, setView] = useState<View>("class");
  const autoStarted = useRef(false);

  const startClass = useCallback(async () => {
    setAuthorizing(true);
    try {
      const config = await apiSend<unknown>("post", `/admin/lessons/${lessonId}/host-authorization`);
      if (!isZoomJoinConfig(config, "host", lessonId)) throw new Error(zoomText.frame.invalidResponse);
      startZoom(config);
    } catch (error) {
      failZoom(error instanceof ApiClientError || error instanceof Error ? error.message : t.hostError);
    } finally {
      setAuthorizing(false);
    }
  }, [lessonId, startZoom, failZoom]);

  useEffect(() => {
    if (autoStarted.current) return;
    autoStarted.current = true;
    void startClass();
  }, [startClass]);

  // Ask Zoom for the status right after joining and right after leaving, so students see the
  // lesson go LIVE / ENDED within seconds even when the webhook is late or can't reach us.
  // Zoom may take a moment to report the change, so retry a few times.
  const expected: MeetingStatus | null = zoom.status === "joined" ? "LIVE" : zoom.status === "left" ? "ENDED" : null;
  useEffect(() => {
    if (!expected || meetingStatus === expected) return;
    let cancelled = false;
    void (async () => {
      for (const delayMs of [1_500, 4_000, 8_000, 15_000]) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (cancelled) return;
        const result = await run(() => apiSend<{ meetingStatus: MeetingStatus }>("patch", `/admin/lessons/${lessonId}/zoom-meeting`), {
          onError: () => true, // background check: stay quiet, the manual button remains
        });
        // Leaving without ending keeps the meeting running: LIVE is a final answer then too.
        if (result?.meetingStatus === expected || (expected === "ENDED" && result?.meetingStatus === "LIVE" && delayMs >= 8_000)) return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expected, meetingStatus, lessonId, run]);

  // Closing or reloading the tab leaves the meeting: ask first while connected.
  const inMeeting = zoom.status === "connecting" || zoom.status === "joined";
  useEffect(() => {
    if (!inMeeting) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [inMeeting]);

  const busy = authorizing || zoom.status === "connecting";
  const showPanel = (id: PanelId) => {
    setPanel(id);
    setView(id);
  };

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          {/* A new tab: following a link in this one would leave the meeting. */}
          <a
            href={`/admin/mesimet/${lessonId}`}
            target="_blank"
            rel="noopener"
            className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            {r.back} <ExternalLink className="size-3.5" aria-hidden />
          </a>
          <h1 className="truncate font-heading text-lg">{title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span aria-live="polite" className="text-muted-foreground">
            {busy && t.connecting}
            {zoom.status === "joined" && <span className="text-live">{t.joined}</span>}
            {zoom.status === "left" && (meetingStatus === "ENDED" ? t.ended : t.left)}
          </span>
          {(zoom.status === "left" || zoom.status === "error") && (
            <Button size="sm" onClick={() => void startClass()} disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <Video aria-hidden />}
              {meetingStatus === "ENDED" ? t.restart : t.rejoin}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => apiSend("patch", `/admin/lessons/${lessonId}/zoom-meeting`), { success: t.synced })}
          >
            <RefreshCw aria-hidden />
            {t.sync}
          </Button>
          {zoom.open && <ZoomFullscreenButton frameRef={zoom.frameRef} className="max-lg:hidden" />}
        </div>
      </header>

      {/* Phones/tablets: one view at a time; the meeting keeps running while hidden. */}
      <nav aria-label={r.views} className="grid grid-cols-4 gap-1 border-b px-2 py-2 lg:hidden">
        {[{ id: "class" as const, label: r.classTab }, ...PANELS].map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={view === item.id}
            onClick={() => (item.id === "class" ? setView("class") : showPanel(item.id))}
            className={cn(
              "h-9 truncate rounded-md px-1 text-xs font-medium sm:text-sm",
              view === item.id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <section aria-label={t.frameTitle} className={cn("flex min-h-0 flex-col bg-black text-white", view !== "class" && "max-lg:hidden")}>
          {zoom.status === "error" && zoom.error && (
            <div role="alert" className="m-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-background p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>{zoom.error}</p>
            </div>
          )}
          {zoom.open ? (
            <ZoomFrame frameRef={zoom.frameRef} frameKey={zoom.frameKey} title={t.frameTitle} className="min-h-0 flex-1" />
          ) : (
            <p className="m-auto text-sm text-white/70">{busy ? t.connecting : r.idle}</p>
          )}
        </section>

        <aside aria-label={r.tools} className={cn("min-h-0 overflow-y-auto p-4 lg:border-l", view === "class" && "max-lg:hidden")}>
          <div role="tablist" aria-label={r.tools} className="mb-4 hidden grid-cols-3 gap-1 rounded-lg bg-muted p-1 lg:grid">
            {PANELS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={panel === item.id}
                onClick={() => showPanel(item.id)}
                className={cn(
                  "h-8 rounded-md text-sm font-medium",
                  panel === item.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          {PANELS.map((item) => (
            <div key={item.id} role="tabpanel" hidden={panel !== item.id}>
              {panels[item.id]}
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
