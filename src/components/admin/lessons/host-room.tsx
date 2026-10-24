"use client";

import { AlertCircle, ArrowLeft, LoaderCircle, RefreshCw, Video } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApiAction } from "@/components/admin/use-api-action";
import { Button } from "@/components/ui/button";
import { ZoomFrame, ZoomFullscreenButton } from "@/components/zoom/zoom-frame";
import type { MeetingStatus } from "@/generated/prisma/enums";
import { isZoomJoinConfig, useZoomFrame } from "@/hooks/use-zoom-frame";
import { zoomText } from "@/i18n/zoom";
import { ApiClientError, apiSend } from "@/lib/api/client";

const t = zoomText.admin;
const r = zoomText.room;

/**
 * Full-window host classroom: starts the meeting as soon as the tab opens, marks the lesson
 * live once the host is in (without waiting for the webhook) and warns before the tab closes.
 */
export function HostRoom({ lessonId, title, meetingStatus }: { lessonId: string; title: string; meetingStatus: MeetingStatus }) {
  const { run, pending } = useApiAction();
  const zoom = useZoomFrame(t.hostError);
  const startZoom = zoom.start;
  const failZoom = zoom.fail;
  const [authorizing, setAuthorizing] = useState(false);
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

  // Ask Zoom for the status right after joining, so students see the lesson as LIVE within
  // seconds even when the "meeting started" webhook is late or can't reach us.
  const hostJoined = zoom.status === "joined";
  useEffect(() => {
    if (!hostJoined || meetingStatus === "LIVE") return;
    let cancelled = false;
    void (async () => {
      for (const delayMs of [1_500, 4_000, 8_000, 15_000]) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (cancelled) return;
        const result = await run(() => apiSend<{ meetingStatus: MeetingStatus }>("patch", `/admin/lessons/${lessonId}/zoom-meeting`), {
          onError: () => true, // background check: stay quiet, the manual button remains
        });
        if (result?.meetingStatus === "LIVE") return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hostJoined, meetingStatus, lessonId, run]);

  // Closing or reloading the tab leaves the meeting: ask first while connected.
  const inMeeting = zoom.status === "connecting" || zoom.status === "joined";
  useEffect(() => {
    if (!inMeeting) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [inMeeting]);

  const busy = authorizing || zoom.status === "connecting";

  return (
    <div className="flex h-dvh flex-col bg-black text-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-background px-3 py-2 text-foreground">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={`/admin/mesimet/${lessonId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden /> {r.back}
          </Link>
          <h1 className="truncate font-heading text-lg">{title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span aria-live="polite" className="text-muted-foreground">
            {busy && t.connecting}
            {zoom.status === "joined" && <span className="text-live">{t.joined}</span>}
            {zoom.status === "left" && t.left}
          </span>
          {(zoom.status === "left" || zoom.status === "error") && (
            <Button size="sm" onClick={() => void startClass()} disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <Video aria-hidden />}
              {t.rejoin}
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
          {zoom.open && <ZoomFullscreenButton frameRef={zoom.frameRef} />}
        </div>
      </header>

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
    </div>
  );
}
