"use client";

import type { RefObject } from "react";
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
