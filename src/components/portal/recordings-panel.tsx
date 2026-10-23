"use client";

import { PlayCircle } from "lucide-react";
import { useCallback, useState } from "react";
import { portalText } from "@/i18n/portal";
import { apiSend } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";
import { ProtectedVideo, type VideoGrant } from "./protected-video";

const t = portalText.recordings;

export type RecordingItem = { id: string; part: number; displayName: string | null; durationSeconds: number | null };

function formatDuration(seconds: number | null) {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h} orë ${m} min` : `${m} min`;
}

function RecordingPlayer({ lessonId, recording, visible }: { lessonId: string; recording: RecordingItem; visible: boolean }) {
  const requestGrant = useCallback(() => apiSend<VideoGrant>("post", `/lessons/${lessonId}/recordings/${recording.id}/playback`), [lessonId, recording.id]);
  return <ProtectedVideo requestGrant={requestGrant} visible={visible} expiredMessage={t.expired} />;
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
                  "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors duration-200 hover:bg-muted",
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
