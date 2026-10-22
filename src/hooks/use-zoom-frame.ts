"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Shared protocol between our pages and the isolated Zoom SDK frame (public/zoom-frame.html),
 * used by both the student classroom and the admin host panel.
 *
 * Flow: start(config) mounts a fresh frame → frame posts READY once its SDK loaded → we post the
 * server-issued authorization once and forget it → frame posts JOINED / ERROR / LEFT.
 * Messages are accepted only from our own frame on our own origin.
 */

export type ZoomJoinConfig = {
  mode: "host" | "student";
  lessonId: string;
  signature: string;
  meetingNumber: string;
  password: string;
  userName: string;
  zak?: string;
};

export type ZoomFrameStatus = "idle" | "connecting" | "joined" | "left" | "error";

export function isZoomJoinConfig(value: unknown, mode: ZoomJoinConfig["mode"], lessonId: string): value is ZoomJoinConfig {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.mode === mode &&
    v.lessonId === lessonId &&
    typeof v.signature === "string" &&
    typeof v.meetingNumber === "string" &&
    typeof v.password === "string" &&
    typeof v.userName === "string" &&
    (mode !== "host" || typeof v.zak === "string")
  );
}

export function useZoomFrame(fallbackError: string) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  // Short-lived credentials live only here, and only until they're handed to the frame.
  const pendingConfig = useRef<ZoomJoinConfig | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ZoomFrameStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent<unknown>) {
      const frameWindow = frameRef.current?.contentWindow;
      if (!frameWindow || event.source !== frameWindow || event.origin !== window.location.origin) return;
      const data = event.data as { type?: unknown; message?: unknown } | null;
      if (!data || typeof data !== "object") return;

      switch (data.type) {
        case "BEAUTY_ZOOM_FRAME_READY": {
          const config = pendingConfig.current;
          if (!config) return;
          frameWindow.postMessage({ type: "BEAUTY_ZOOM_JOIN", payload: config }, window.location.origin);
          pendingConfig.current = null;
          return;
        }
        case "BEAUTY_ZOOM_JOINED":
          setStatus("joined");
          return;
        case "BEAUTY_ZOOM_FRAME_ERROR":
          pendingConfig.current = null;
          setOpen(false);
          setStatus("error");
          setError(typeof data.message === "string" ? data.message : fallbackError);
          return;
        case "BEAUTY_ZOOM_LEFT":
          setOpen(false);
          setStatus("left");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [fallbackError]);

  const start = useCallback((config: ZoomJoinConfig) => {
    pendingConfig.current = config;
    setError(null);
    setStatus("connecting");
    setFrameKey((key) => key + 1); // always a fresh frame, so READY fires again on retries
    setOpen(true);
  }, []);

  const fail = useCallback((message: string) => {
    pendingConfig.current = null;
    setOpen(false);
    setStatus("error");
    setError(message);
  }, []);

  return { frameRef, frameKey, open, status, error, start, fail };
}
