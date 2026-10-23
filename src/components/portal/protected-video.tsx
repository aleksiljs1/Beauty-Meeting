"use client";

import { Loader2, PlayCircle, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { portalText } from "@/i18n/portal";
import { ApiClientError } from "@/lib/api/client";
import { grantRenewDelayMs } from "@/lib/polling";

const t = portalText.recordings;

export type VideoGrant = { url: string; expiresInSeconds: number };
type Status = "idle" | "loading" | "ready" | "error" | "expired";

const MAX_ERROR_RENEWALS = 3;

/**
 * Plays a private video from a short-lived grant (recordings and video materials). The grant
 * is renewed shortly before it expires and whenever the media request fails; the position and
 * play state are restored. Once the access deadline passes, renewal is refused and the player
 * stops. `initialGrant` skips the "Luaj" placeholder when the caller already fetched one.
 */
export function ProtectedVideo({
  requestGrant,
  visible,
  initialGrant,
  label,
  expiredMessage,
}: {
  requestGrant: () => Promise<VideoGrant>;
  visible: boolean;
  initialGrant?: VideoGrant;
  label?: string;
  expiredMessage: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(initialGrant?.url ?? null);
  const [status, setStatus] = useState<Status>(initialGrant ? "ready" : "idle");
  const [message, setMessage] = useState<string | null>(null);
  // The user just asked to watch: start playing as soon as the metadata is in.
  const resume = useRef<{ time: number; playing: boolean } | null>(initialGrant ? { time: 0, playing: true } : null);
  const renewTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const errorRenewals = useRef(0);
  const loadRef = useRef<(preserve: boolean) => Promise<void>>(async () => undefined);
  const requestRef = useRef(requestGrant);

  useEffect(() => {
    requestRef.current = requestGrant;
  }, [requestGrant]);

  const load = useCallback(
    async (preserve: boolean) => {
      const video = videoRef.current;
      if (preserve && video && video.currentSrc) {
        resume.current = { time: video.currentTime, playing: !video.paused && !video.ended };
      } else if (!preserve) {
        resume.current = { time: 0, playing: true }; // the user pressed "Luaj"
      }
      clearTimeout(renewTimer.current);
      if (!preserve) setStatus("loading");
      try {
        const grant = await requestRef.current();
        setSrc(grant.url);
        setStatus("ready");
        renewTimer.current = setTimeout(() => void loadRef.current(true), grantRenewDelayMs(grant.expiresInSeconds));
      } catch (error) {
        const code = error instanceof ApiClientError ? error.code : null;
        if (code === "LESSON_ACCESS_EXPIRED" || code === "LESSON_NOT_AVAILABLE" || code === "NOT_FOUND") {
          setStatus("expired");
          setMessage(code === "LESSON_ACCESS_EXPIRED" ? expiredMessage : (error as ApiClientError).message);
          videoRef.current?.pause();
        } else {
          setStatus("error");
          setMessage(error instanceof ApiClientError ? error.message : t.errorRetry);
        }
      }
    },
    [expiredMessage],
  );

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  // A grant handed in by the caller is renewed on the same schedule as one fetched here.
  useEffect(() => {
    if (initialGrant) renewTimer.current = setTimeout(() => void loadRef.current(true), grantRenewDelayMs(initialGrant.expiresInSeconds));
    return () => clearTimeout(renewTimer.current);
    // Only the grant present at mount; later grants are scheduled by `load`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hidden panel (other tab): don't keep playing audio in the background.
  useEffect(() => {
    if (!visible) videoRef.current?.pause();
  }, [visible]);

  const onLoadedMetadata = () => {
    const video = videoRef.current;
    const state = resume.current;
    if (!video || !state) return;
    resume.current = null;
    video.currentTime = state.time;
    if (state.playing) void video.play().catch(() => undefined);
  };

  const onError = () => {
    // Usually an expired URL during a Range request: get a new grant and continue.
    if (errorRenewals.current >= MAX_ERROR_RENEWALS) {
      setStatus("error");
      setMessage(t.errorRetry);
      return;
    }
    errorRenewals.current += 1;
    void load(true);
  };

  if (status === "expired") {
    return <p className="rounded-md border bg-muted px-3 py-3 text-sm text-muted-foreground">{message}</p>;
  }

  return (
    <div className="grid gap-2">
      <div className="relative overflow-hidden rounded-lg border bg-foreground/95">
        {src ? (
          <video
            ref={videoRef}
            src={src}
            controls
            preload="metadata"
            playsInline
            controlsList="nodownload"
            aria-label={label}
            className="aspect-video w-full bg-black"
            onLoadedMetadata={onLoadedMetadata}
            onPlaying={() => {
              errorRenewals.current = 0;
            }}
            onError={onError}
          >
            {t.videoUnsupported}
          </video>
        ) : (
          <button
            type="button"
            onClick={() => void load(false)}
            disabled={status === "loading"}
            className="flex aspect-video w-full flex-col items-center justify-center gap-2 text-background focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {status === "loading" ? <Loader2 aria-hidden="true" className="size-10 animate-spin" /> : <PlayCircle aria-hidden="true" className="size-12" strokeWidth={1.25} />}
            <span className="text-sm">{status === "loading" ? t.loading : t.play}</span>
          </button>
        )}
      </div>
      {status === "error" ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <span>{message ?? t.errorRetry}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              errorRenewals.current = 0;
              void load(Boolean(src));
            }}
          >
            <RotateCcw aria-hidden="true" />
            {portalText.stage.retry}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
