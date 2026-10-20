"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useLiveFeed } from "@/hooks/use-live-feed";

/**
 * Re-renders the current Server Component page (router.refresh — client state is kept, nothing
 * remounts) when the set of live lessons in the shared feed changes, so cards and the
 * classroom stage follow the stored meeting state without their own polling.
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

  return null;
}
