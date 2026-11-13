"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useLiveFeed } from "@/hooks/use-live-feed";
import { isRealtimeConnected, subscribeRealtime } from "@/lib/realtime/client";

/** Several signals in a row (e.g. a multi-file upload) cause one refresh. */
const CONTENT_REFRESH_DELAY_MS = 600;
/** Lists (dashboard, lessons) wait a little longer: they change less often and are bigger. */
const LIST_REFRESH_DELAY_MS = 1_500;

/**
 * Re-renders the current Server Component page (router.refresh — client state is kept, nothing
 * remounts) when the set of live lessons in the shared feed changes, so cards and the
 * classroom stage follow the stored meeting state without their own polling.
 *
 * It also refreshes on every realtime signal for this student (new or deleted materials and
 * recordings, moved lessons, new enrolments send one), and after a reconnect in case a signal was
 * missed. The signal carries no data: the refresh goes through the normal, policy-checked page load.
 */
export function LiveRefresher({ lessonId }: { lessonId?: string }) {
  const router = useRouter();
  const { feed } = useLiveFeed();
  const previous = useRef<string | null>(null);

  const signature = feed
    ? feed.notifications
        .filter((n) => n.type === "LESSON_LIVE" && n.active && (!lessonId || n.lessonId === lessonId))
        .map((n) => n.lessonId)
        .sort()
        .join(",")
    : null;

  useEffect(() => {
    if (signature === null) return;
    if (previous.current !== null && previous.current !== signature) router.refresh();
    previous.current = signature;
  }, [signature, router]);

  useEffect(() => {
    const delay = lessonId ? CONTENT_REFRESH_DELAY_MS : LIST_REFRESH_DELAY_MS;
    let connectedBefore = isRealtimeConnected();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeRealtime((reason) => {
      // The first connect is the page we just loaded; later ones are reconnects.
      if (reason === "connected" && !connectedBefore) {
        connectedBefore = true;
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), delay);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [lessonId, router]);

  return null;
}
