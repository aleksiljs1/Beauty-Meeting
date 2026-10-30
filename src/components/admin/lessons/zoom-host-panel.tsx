"use client";

import { CircleHelp, RefreshCw, Video } from "lucide-react";
import Link from "next/link";
import { useApiAction } from "@/components/admin/use-api-action";
import { Button } from "@/components/ui/button";
import { ZoomAppLink } from "@/components/zoom/zoom-app-link";
import type { MeetingStatus, PublicationStatus } from "@/generated/prisma/enums";
import { zoomText } from "@/i18n/zoom";
import { apiSend } from "@/lib/api/client";

const t = zoomText.admin;

type Props = {
  lessonId: string;
  zoomLive: boolean;
  meetingNumber: string | null;
  publication: PublicationStatus;
  meetingStatus: MeetingStatus;
};

/**
 * Admin Zoom controls for one lesson: start it as host inside the site (or, deliberately, in the
 * Zoom desktop app; the meeting is created on the first start), and re-sync its status from Zoom
 * if a webhook was missed. Host credentials are requested from the server per session and handed straight to the
 * isolated frame / the Zoom link; nothing is kept.
 */
export function ZoomHostPanel({ lessonId, zoomLive, meetingNumber, publication, meetingStatus }: Props) {
  const { run, pending } = useApiAction();
  if (!zoomLive) return <p className="text-sm text-muted-foreground">{t.notLive}</p>;

  const finished = meetingStatus === "ENDED" || meetingStatus === "ERROR";
  const ended = meetingStatus === "ENDED";
  const canHost = publication === "PUBLISHED" && meetingStatus !== "ERROR";

  return (
    <div className="space-y-4">
      {meetingNumber ? (
        <p className="text-sm text-muted-foreground">
          {t.meetingNumber}: <span className="font-medium text-foreground tabular-nums">{meetingNumber}</span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{t.createdOnStart}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {canHost && (
          // Its own tab: the call keeps running while the admin portal is used in this one.
          <Button asChild>
            <a href={`/klasa/${lessonId}`} target={`klasa-${lessonId}`} rel="noopener">
              <Video aria-hidden />
              {meetingStatus === "LIVE" ? t.rejoin : ended ? t.restart : t.start}
            </a>
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

      {publication !== "PUBLISHED" && !finished && <p className="text-sm text-muted-foreground">{t.needsPublish}</p>}
      {ended && <p className="text-sm text-muted-foreground">{t.ended}</p>}
      {meetingStatus === "ERROR" && <p className="text-sm text-muted-foreground">{t.finished}</p>}

      {canHost && <p className="text-sm text-muted-foreground">{t.roomHint}</p>}

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
