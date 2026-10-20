"use client";

import { useEffect, useRef, useState } from "react";
import { apiSend } from "@/lib/api/client";
import { errorMessage } from "@/components/admin/use-api-action";
import { admin } from "@/i18n/admin";

type Grant = { url: string; expiresInSeconds: number };

/**
 * Admin preview player. Playback URLs live ~5 minutes, so a fresh grant is requested shortly
 * before expiry (or after a playback error) and the position is restored.
 */
export function RecordingPreview({ recordingId, name }: { recordingId: string; name: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const resume = useRef<{ time: number; playing: boolean } | null>(null);
  const retried = useRef(false);
  const [grant, setGrant] = useState<{ url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumping this requests a new grant (timer before expiry, or a playback error).
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    apiSend<Grant>("post", `/admin/recordings/${recordingId}/playback`)
      .then((next) => {
        if (cancelled) return;
        const element = video.current;
        if (element?.currentSrc) resume.current = { time: element.currentTime, playing: !element.paused };
        setGrant({ url: next.url });
        setError(null);
        timer = setTimeout(() => setGeneration((g) => g + 1), Math.max(10, next.expiresInSeconds - 30) * 1000);
      })
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [recordingId, generation]);

  return (
    <div className="space-y-2" aria-live="polite">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {grant && (
        <video
          ref={video}
          src={grant.url}
          controls
          preload="metadata"
          className="aspect-video w-full rounded-md bg-black"
          aria-label={admin.recordings.previewLabel(name)}
          onLoadedMetadata={(e) => {
            const r = resume.current;
            if (r) {
              e.currentTarget.currentTime = r.time;
              if (r.playing) void e.currentTarget.play().catch(() => undefined);
              resume.current = null;
            }
            retried.current = false;
          }}
          onError={() => {
            if (retried.current) return;
            retried.current = true;
            setGeneration((g) => g + 1);
          }}
        />
      )}
    </div>
  );
}
