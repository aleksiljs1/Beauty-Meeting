"use client";

import { AlertCircle, CheckCircle2, CircleHelp, LoaderCircle, RefreshCw, Video } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { useApiAction } from "@/components/admin/use-api-action";
import { Button } from "@/components/ui/button";
import { ZoomAppLink } from "@/components/zoom/zoom-app-link";
import { ZoomFrame, ZoomFullscreenButton } from "@/components/zoom/zoom-frame";
import type { MeetingStatus, PublicationStatus } from "@/generated/prisma/enums";
import { isZoomJoinConfig, useZoomFrame } from "@/hooks/use-zoom-frame";
import { zoomText } from "@/i18n/zoom";
import { ApiClientError, apiSend } from "@/lib/api/client";

const t = zoomText.admin;

type Props = {
  lessonId: string;
  zoomLive: boolean;
  meetingNumber: string | null;
  publication: PublicationStatus;
  meetingStatus: MeetingStatus;
};

/**
 * Admin Zoom controls for one lesson: create the meeting, start it as host inside the site (or,
 * deliberately, in the Zoom desktop app), and re-sync its status from Zoom if a webhook was
 * missed. Host credentials are requested from the server per session and handed straight to the
 * isolated frame / the Zoom link; nothing is kept.
 */
export function ZoomHostPanel({ lessonId, zoomLive, meetingNumber, publication, meetingStatus }: Props) {
  const { run, pending } = useApiAction();
  const zoom = useZoomFrame(t.hostError);
  const [authorizing, setAuthorizing] = useState(false);

  // Once the host is in the meeting, ask Zoom for its status straight away instead of waiting
  // for the "meeting started" webhook, so students see the lesson as LIVE within seconds (and
  // it still works when the webhook is late or can't reach us). Zoom may take a moment to
  // report "started", so retry a few times.
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

  if (!zoomLive) return <p className="text-sm text-muted-foreground">{t.notLive}</p>;

  const finished = meetingStatus === "ENDED" || meetingStatus === "ERROR";
  const canCreate = !meetingNumber && publication !== "CANCELLED" && publication !== "ARCHIVED" && !finished;
  const canHost = !!meetingNumber && publication === "PUBLISHED" && !finished;

  const startClass = async () => {
    setAuthorizing(true);
    try {
      const config = await apiSend<unknown>("post", `/admin/lessons/${lessonId}/host-authorization`);
      if (!isZoomJoinConfig(config, "host", lessonId)) throw new Error(zoomText.frame.invalidResponse);
      zoom.start(config);
    } catch (error) {
      zoom.fail(error instanceof ApiClientError || error instanceof Error ? error.message : t.hostError);
    } finally {
      setAuthorizing(false);
    }
  };

  return (
    <div className="space-y-4">
      {meetingNumber ? (
        <p className="text-sm text-muted-foreground">
          {t.meetingNumber}: <span className="font-medium text-foreground tabular-nums">{meetingNumber}</span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{t.needsMeeting}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {canCreate && (
          <ConfirmAction
            trigger={
              <Button variant="outline" disabled={pending}>
                <Video aria-hidden />
                {t.createMeeting}
              </Button>
            }
            title={t.createTitle}
            description={t.createDescription}
            confirmLabel={t.createMeeting}
            onConfirm={() => run(() => apiSend("post", `/admin/lessons/${lessonId}/zoom-meeting`), { success: t.created })}
          />
        )}

        {canHost && (
          <Button onClick={() => void startClass()} disabled={authorizing || zoom.status === "connecting" || zoom.status === "joined"}>
            {authorizing ? <LoaderCircle className="animate-spin" aria-hidden /> : <Video aria-hidden />}
            {meetingStatus === "LIVE" ? t.rejoin : t.start}
          </Button>
        )}

        {meetingNumber && (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => apiSend("patch", `/admin/lessons/${lessonId}/zoom-meeting`), { success: t.synced })}
          >
            <RefreshCw aria-hidden />
            {t.sync}
          </Button>
        )}
      </div>

      {canHost && (
        <div className="space-y-2 rounded-md border border-dashed p-3">
          <p className="text-sm text-muted-foreground">{t.appStartHint}</p>
          <ZoomAppLink
            endpoint={`/admin/lessons/${lessonId}/host-app-start`}
            field="startUrl"
            className="justify-items-start"
            labels={{ request: t.appStart, preparing: t.appStartPreparing, ready: t.appStartReady, open: t.appStartOpen, error: t.appStartError }}
          />
        </div>
      )}

      {meetingNumber && publication !== "PUBLISHED" && !finished && <p className="text-sm text-muted-foreground">{t.needsPublish}</p>}
      {finished && <p className="text-sm text-muted-foreground">{t.finished}</p>}

      <div aria-live="polite" className="text-sm">
        {zoom.status === "connecting" && <span className="text-muted-foreground">{t.connecting}</span>}
        {zoom.status === "joined" && (
          <span className="inline-flex items-center gap-2 text-live">
            <CheckCircle2 className="size-4" aria-hidden />
            {t.joined}
          </span>
        )}
        {zoom.status === "left" && <span className="text-muted-foreground">{t.left}</span>}
      </div>

      {zoom.status === "error" && zoom.error && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{zoom.error}</p>
        </div>
      )}

      {zoom.open && (
        <div className="space-y-2">
          <ZoomFrame frameRef={zoom.frameRef} frameKey={zoom.frameKey} title={t.frameTitle} className="h-[72vh] min-h-[28rem] rounded-lg border" />
          <ZoomFullscreenButton frameRef={zoom.frameRef} />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t.note}</p>
        <Link href="/admin/ndihme" className="inline-flex items-center gap-1.5 text-sm text-rose-deep underline-offset-4 hover:underline">
          <CircleHelp className="size-4" aria-hidden />
          {t.helpLink}
        </Link>
      </div>
    </div>
  );
}
