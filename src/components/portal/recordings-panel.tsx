"use client";

import { Loader2, PlayCircle, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { portalText } from "@/i18n/portal";
import { ApiClientError, apiSend } from "@/lib/api/client";
import { grantRenewDelayMs } from "@/lib/polling";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";

const t = portalText.recordings;

export type RecordingItem = { id: string; part: number; displayName: string | null; durationSeconds: number | null };

type Grant = { url: string; expiresInSeconds: number };
type Status = "idle" | "loading" | "ready" | "error" | "expired";

const MAX_ERROR_RENEWALS = 3;

function formatDuration(seconds: number | null) {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h} orë ${m} min` : `${m} min`;
}

/**
 * Plays a recording from a short-lived playback grant. The grant is renewed shortly before
 * it expires and whenever the media request fails; the position and play state are restored.
 */
function RecordingPlayer({ lessonId, recording, visible }: { lessonId: string; recording: RecordingItem; visible: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const resume = useRef<{ time: number; playing: boolean } | null>(null);
  const renewTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const errorRenewals = useRef(0);
  const loadRef = useRef<(preserve: boolean) => Promise<void>>(async () => undefined);

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
        const grant = await apiSend<Grant>("post", `/lessons/${lessonId}/recordings/${recording.id}/playback`);
        setSrc(grant.url);
        setStatus("ready");
        renewTimer.current = setTimeout(() => void loadRef.current(true), grantRenewDelayMs(grant.expiresInSeconds));
      } catch (error) {
        const code = error instanceof ApiClientError ? error.code : null;
        if (code === "LESSON_ACCESS_EXPIRED" || code === "LESSON_NOT_AVAILABLE" || code === "NOT_FOUND") {
          setStatus("expired");
          setMessage(code === "LESSON_ACCESS_EXPIRED" ? t.expired : (error as ApiClientError).message);
          videoRef.current?.pause();
        } else {
          setStatus("error");
          setMessage(error instanceof ApiClientError ? error.message : t.errorRetry);
        }
      }
    },
    [lessonId, recording.id],
  );

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => () => clearTimeout(renewTimer.current), []);

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

export function RecordingsPanel({ lessonId, recordings, visible }: { lessonId: string; recordings: RecordingItem[]; visible: boolean }) {
  const [selectedId, setSelectedId] = useState(recordings[0]?.id ?? null);
  const selected = recordings.find((r) => r.id === selectedId) ?? recordings[0];

  if (!selected) return <EmptyState icon={PlayCircle} title={t.empty} />;

  return (
    <div className="grid gap-3">
      {/* key: a different recording gets a fresh player (and grant). */}
      <RecordingPlayer key={selected.id} lessonId={lessonId} recording={selected} visible={visible} />
      {recordings.length > 1 ? (
        <ul className="grid gap-1.5">
          {recordings.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                aria-pressed={r.id === selected.id}
                onClick={() => setSelectedId(r.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted",
                  r.id === selected.id && "border-foreground/40 bg-secondary",
                )}
              >
                <span className="truncate">{r.displayName ?? t.part(r.part)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDuration(r.durationSeconds) ?? t.part(r.part)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{selected.displayName ?? t.part(selected.part)}</p>
      )}
    </div>
  );
}
