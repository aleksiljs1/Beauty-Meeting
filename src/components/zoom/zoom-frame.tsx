"use client";

import { Maximize } from "lucide-react";
import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import { zoomText } from "@/i18n/zoom";
import { cn } from "@/lib/utils";

/** The isolated Zoom SDK frame. Remounted (via `frameKey`) for every new session. */
export function ZoomFrame({
  frameRef,
  frameKey,
  title,
  className,
}: {
  frameRef: RefObject<HTMLIFrameElement | null>;
  frameKey: number;
  title: string;
  className?: string;
}) {
  return (
    <iframe
      key={frameKey}
      ref={frameRef}
      title={title}
      src="/zoom-frame.html"
      allow="camera; microphone; display-capture; autoplay; fullscreen"
      allowFullScreen
      referrerPolicy="no-referrer"
      className={cn("w-full border-0 bg-black", className)}
    />
  );
}

/**
 * Puts the whole meeting frame in browser full screen. Zoom's own full-screen control is not
 * reliable inside an embedded frame; Esc (or the browser's own control) leaves full screen.
 */
export function ZoomFullscreenButton({ frameRef, className }: { frameRef: RefObject<HTMLIFrameElement | null>; className?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={() => void frameRef.current?.requestFullscreen?.().catch(() => undefined)}
    >
      <Maximize aria-hidden />
      {zoomText.frame.fullscreen}
    </Button>
  );
}
