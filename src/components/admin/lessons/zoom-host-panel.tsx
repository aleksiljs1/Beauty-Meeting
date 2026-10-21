
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiClientError, apiSend } from "@/lib/api/client";

type MeetingStatus = "NOT_PROVISIONED" | "SCHEDULED" | "LIVE" | "ENDED" | "ERROR";
type Publication = "DRAFT" | "PUBLISHED" | "ARCHIVED" | "CANCELLED";

type HostConfig = {
  mode: "host";
  lessonId: string;
  signature: string;
  meetingNumber: string;
  password: string;
  userName: string;
  zak: string;
};

type FrameMessage = {
  type?: unknown;
  mode?: unknown;
  message?: unknown;
};

type Props = {
  lessonId: string;
  hasZoomMeeting: boolean;
  isDemo: boolean;
  publication: Publication;
  meetingStatus: MeetingStatus;
};

/**
 * Admin-only Zoom host panel.
 * The server verifies admin access and creates the short-lived authorization.
 * Secrets such as the Meeting SDK Client Secret never enter this component.
 */
export function ZoomHostPanel({
  lessonId,
  hasZoomMeeting,
  isDemo,
  publication,
  meetingStatus,
}: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const joinSentRef = useRef(false);

  const [frameOpen, setFrameOpen] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const [hostConfig, setHostConfig] = useState<HostConfig | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "connecting" | "joined" | "left">("idle");

  const canHost =
    hasZoomMeeting &&
    !isDemo &&
    publication === "PUBLISHED" &&
    meetingStatus !== "ENDED" &&
    meetingStatus !== "ERROR";

  const sendJoinRequest = useCallback(() => {
    const target = frameRef.current?.contentWindow;

    if (!target || !frameReady || !hostConfig || joinSentRef.current) return;

    // Same-origin messaging only; the frame also validates its parent origin.
    target.postMessage(
      { type: "BEAUTY_ZOOM_JOIN", payload: hostConfig },
      window.location.origin,
    );

    // The SDK signature and ZAK are short-lived. Do not retain them after sending.
    joinSentRef.current = true;
    setHostConfig(null);
    setStatus("connecting");
  }, [frameReady, hostConfig]);

  useEffect(() => {
    if (frameReady && hostConfig) sendJoinRequest();
  }, [frameReady, hostConfig, sendJoinRequest]);

  useEffect(() => {
    function onMessage(event: MessageEvent<FrameMessage>) {
      const frameWindow = frameRef.current?.contentWindow;

      if (
        !frameWindow ||
        event.origin !== window.location.origin ||
        event.source !== frameWindow
      ) {
        return;
      }

      const data = event.data;
      if (!data || typeof data !== "object") return;

      switch (data.type) {
        case "BEAUTY_ZOOM_FRAME_READY":
          setFrameReady(true);
          break;

        case "BEAUTY_ZOOM_JOINED":
          if (data.mode !== "host") return;
          setStatus("joined");
          setError(null);
          break;

        case "BEAUTY_ZOOM_FRAME_ERROR":
          setHostConfig(null);
          joinSentRef.current = false;
          setStatus("idle");
          setError(
            typeof data.message === "string"
              ? data.message
              : "Nuk mund të lidhemi me Zoom. Provoni përsëri.",
          );
          break;

        case "BEAUTY_ZOOM_LEFT":
          setFrameOpen(false);
          setFrameReady(false);
          setHostConfig(null);
          joinSentRef.current = false;
          setStatus("left");
          break;
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const startClass = async () => {
    if (!canHost || pending) return;

    setPending(true);
    setError(null);
    setStatus("loading");
    joinSentRef.current = false;

    try {
      const config = await apiSend<HostConfig>(
        "post",
        `/admin/lessons/${lessonId}/host-authorization`,
      );

      if (
        config.mode !== "host" ||
        config.lessonId !== lessonId ||
        !config.signature ||
        !config.meetingNumber ||
        !config.zak
      ) {
        throw new Error("Përgjigjja e autorizimit të host-it është e pavlefshme.");
      }

      setHostConfig(config);

      // On the first attempt, mount the iframe after obtaining authorization.
      // When retrying, keep an already-loaded frame ready.
      if (!frameOpen) {
        setFrameReady(false);
        setFrameOpen(true);
      }
    } catch (cause) {
      setHostConfig(null);
      setStatus("idle");
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : "Nuk mund të autorizohet host-i.",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      {!hasZoomMeeting ? (
        <p className="text-sm text-muted-foreground">
          Krijoni dhe ruani fillimisht takimin Zoom nga paneli i statusit të mësimit.
        </p>
      ) : isDemo ? (
        <p className="text-sm text-muted-foreground">
          Kjo është klasë demo. Përdorni kontrollet e simulimit.
        </p>
      ) : publication !== "PUBLISHED" ? (
        <p className="text-sm text-muted-foreground">
          Publikoni mësimin para se të nisni klasën live.
        </p>
      ) : meetingStatus === "ENDED" || meetingStatus === "ERROR" ? (
        <p className="text-sm text-muted-foreground">
          Ky takim ka përfunduar ose ka një gabim dhe nuk mund të niset nga kjo faqe.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => void startClass()}
            disabled={pending || status === "connecting" || status === "joined"}
          >
            {pending ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : (
              <Video aria-hidden />
            )}
            {meetingStatus === "LIVE" ? "Rihyr si host" : "Nis klasën live"}
          </Button>

          {status === "connecting" && (
            <span className="text-sm text-muted-foreground">
              Po lidhemi me Zoom...
            </span>
          )}

          {status === "joined" && (
            <span className="inline-flex items-center gap-2 text-sm text-live">
              <CheckCircle2 className="size-4" aria-hidden />
              Host-i u lidh me Zoom.
            </span>
          )}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      )}

      {frameOpen && (
        <iframe
          ref={frameRef}
          title="Klasa live në Zoom"
          src="/zoom-frame.html"
          allow="camera; microphone; display-capture; autoplay; fullscreen"
          allowFullScreen
          className="h-[72vh] min-h-[28rem] w-full rounded-lg border bg-black"
        />
      )}

      <p className="text-xs text-muted-foreground">
        Autorizimi i host-it është i përkohshëm dhe gjenerohet nga serveri.
        Statusi live për studentët do të sinkronizohet veçmas.
      </p>
    </div>
  );
}
