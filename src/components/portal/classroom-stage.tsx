"use client";
import {
  CalendarClock,
  CircleAlert,
  CircleCheck,
  Hourglass,
  Loader2,
  Radio,
  Wrench,
} from "lucide-react";

import { useRouter } from "next/navigation";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { portalText } from "@/i18n/portal";
import { ApiClientError, apiSend } from "@/lib/api/client";
import { formatTime, timezoneAbbreviation } from "@/lib/datetime";
import { formatCountdown } from "@/lib/polling";
import type { StageState } from "@/server/queries/portal";
import { DemoStage } from "./demo-stage";

const t = portalText.stage;

export type StageProps = {
  lessonId: string;
  lessonTitle: string;
  stage: StageState;
  canJoin: boolean;
  joinBlockedMessage: string | null;
  scheduledStartAt: string;
  joinOpensAt: string;
  serverTime: string;
  hasRecordings: boolean;
  autoJoin: boolean;
  onShowRecordings: () => void;
};

type ZoomJoinConfig = {
  mode: "zoom";
  lessonId: string;
  signature: string;
  meetingNumber: string;
  password: string;
  userName: string;
};

type JoinResponse =
  | { mode: "demo" }
  | ZoomJoinConfig;

type JoinState =
  | { kind: "idle" }
  | { kind: "joining" }
  | { kind: "waiting-frame" }
  | { kind: "connecting" }
  | { kind: "joined"; mode: "demo" | "zoom" }
  | { kind: "error"; message: string };

function StageMessage({
  icon,
  title,
  children,
  tone = "default",
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  tone?: "default" | "live";
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <span
        aria-hidden="true"
        className={
          tone === "live"
            ? "flex size-12 items-center justify-center rounded-full bg-live/10 text-live"
            : "flex size-12 items-center justify-center rounded-full bg-secondary text-rose-deep"
        }
      >
        {icon}
      </span>
      <h2 className="text-2xl">{title}</h2>
      {children}
    </div>
  );
}

/** Countdown (display only). When the join window opens, the server is asked again. */
function Countdown({
  startAt,
  opensAt,
  serverTime,
}: {
  startAt: string;
  opensAt: string;
  serverTime: string;
}) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  const refreshed = useRef(false);

  useEffect(() => {
    const offset = new Date(serverTime).getTime() - Date.now();
    const tick = () => setNow(Date.now() + offset);
    tick();

    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [serverTime]);

  useEffect(() => {
    if (now !== null && now >= new Date(opensAt).getTime() && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [now, opensAt, router]);

  const seconds =
    now === null
      ? null
      : Math.max(0, (new Date(startAt).getTime() - now) / 1000);

  return (
    <div className="grid gap-1">
      <p className="text-sm text-muted-foreground">{t.startsIn}</p>
      <p className="font-heading text-3xl tabular-nums" aria-live="off">
        {seconds === null ? "—" : formatCountdown(seconds)}
      </p>
      <p className="text-xs text-muted-foreground">
        {t.opensAt} {formatTime(opensAt)} ({timezoneAbbreviation(opensAt)})
      </p>
    </div>
  );
}

function ClassroomStageImpl(props: StageProps) {
  const { lessonId, stage, canJoin, autoJoin } = props;

  const [join, setJoin] = useState<JoinState>({ kind: "idle" });
  const [frameOpen, setFrameOpen] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const [zoomConfig, setZoomConfig] = useState<ZoomJoinConfig | null>(null);

  const frameRef = useRef<HTMLIFrameElement>(null);
  const joinSentRef = useRef(false);
  const autoJoinTried = useRef(false);

  const requestJoin = useCallback(async () => {
    setJoin({ kind: "joining" });

    try {
      // The server rechecks the student's enrollment, access deadline and join window.
      const result = await apiSend<JoinResponse>(
        "post",
        `/lessons/${lessonId}/join`,
      );

      if (result.mode === "demo") {
        setZoomConfig(null);
        setFrameOpen(false);
        setFrameReady(false);
        joinSentRef.current = false;
        setJoin({ kind: "joined", mode: "demo" });
        return;
      }

      if (
        result.mode !== "zoom" ||
        result.lessonId !== lessonId ||
        !result.signature ||
        !result.meetingNumber ||
        !result.userName
      ) {
        throw new Error("Të dhënat e autorizimit të klasës janë të pavlefshme.");
      }

      // Never accept meeting details from the URL. Use the server-authorized response.
      joinSentRef.current = false;
      setFrameReady(false);
      setZoomConfig(result);
      setFrameOpen(true);
      setJoin({ kind: "waiting-frame" });
    } catch (error) {
      setZoomConfig(null);
      setJoin({
        kind: "error",
        message:
          error instanceof ApiClientError
            ? error.message
            : error instanceof Error
              ? error.message
              : portalText.states.errorBody,
      });
    }
  }, [lessonId]);

  // The isolated Zoom frame sends READY only after its SDK has loaded.
  // Send the short-lived participant authorization once the frame is ready.
  useEffect(() => {
    if (!frameOpen || !frameReady || !zoomConfig || joinSentRef.current) return;

    const target = frameRef.current?.contentWindow;
    if (!target) return;

    target.postMessage(
      { type: "BEAUTY_ZOOM_JOIN", payload: zoomConfig },
      window.location.origin,
    );

    joinSentRef.current = true;
    setZoomConfig(null);
    setJoin({ kind: "connecting" });
  }, [frameOpen, frameReady, zoomConfig]);

  // Accept SDK status messages only from our own embedded Zoom frame.
  useEffect(() => {
    function onMessage(event: MessageEvent<unknown>) {
      const frameWindow = frameRef.current?.contentWindow;

      if (
        !frameWindow ||
        event.origin !== window.location.origin ||
        event.source !== frameWindow ||
        !event.data ||
        typeof event.data !== "object"
      ) {
        return;
      }

      const data = event.data as Record<string, unknown>;

      switch (data.type) {
        case "BEAUTY_ZOOM_FRAME_READY":
          setFrameReady(true);
          break;

        case "BEAUTY_ZOOM_JOINED":
          if (data.mode !== "student") return;
          setJoin({ kind: "joined", mode: "zoom" });
          break;

        case "BEAUTY_ZOOM_FRAME_ERROR":
          setFrameOpen(false);
          setFrameReady(false);
          setZoomConfig(null);
          joinSentRef.current = false;
          setJoin({
            kind: "error",
            message:
              typeof data.message === "string"
                ? data.message
                : portalText.states.errorBody,
          });
          break;

        case "BEAUTY_ZOOM_LEFT":
          setFrameOpen(false);
          setFrameReady(false);
          setZoomConfig(null);
          joinSentRef.current = false;
          setJoin({ kind: "idle" });
          break;
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // "Bashkohu" from the alert/dashboard was an explicit click; finish it here once.
  useEffect(() => {
    if (!autoJoin || autoJoinTried.current) return;

    const id = setTimeout(() => {
      autoJoinTried.current = true;

      const url = new URL(window.location.href);
      url.searchParams.delete("bashkohu");
      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );

      if (stage === "LIVE" && canJoin) void requestJoin();
    }, 0);

    return () => clearTimeout(id);
  }, [autoJoin, stage, canJoin, requestJoin]);

  const isJoining =
    join.kind === "joining" ||
    join.kind === "waiting-frame" ||
    join.kind === "connecting";

  const showZoomFrame =
    frameOpen &&
    (
      join.kind === "waiting-frame" ||
      join.kind === "connecting" ||
      (join.kind === "joined" && join.mode === "zoom")
    );

  let content: ReactNode;

  if (stage === "ENDED") {
    content = (
      <StageMessage icon={<CircleCheck className="size-6" />} title={t.endedTitle}>
        <p className="max-w-md text-sm text-muted-foreground">
          {props.hasRecordings ? t.endedReplay : t.endedBody}
        </p>

        {props.hasRecordings ? (
          <Button size="lg" onClick={props.onShowRecordings}>
            {t.watchReplay}
          </Button>
        ) : null}
      </StageMessage>
    );
  } else if (join.kind === "joined" && join.mode === "demo") {
    content = (
      <DemoStage
        lessonTitle={props.lessonTitle}
        onLeave={() => setJoin({ kind: "idle" })}
      />
    );
  } else if (showZoomFrame) {
    content = (
      <div className="flex min-h-[22rem] flex-1 flex-col bg-black lg:min-h-[32rem]">
        <iframe
          ref={frameRef}
          title="Klasa live në Zoom"
          src="/zoom-frame.html"
          allow="camera; microphone; display-capture; autoplay; fullscreen"
          allowFullScreen
          referrerPolicy="no-referrer"
          className="h-[65vh] min-h-[28rem] w-full flex-1 border-0 bg-black"
        />
      </div>
    );
  } else if (stage === "LIVE") {
    content = (
      <StageMessage
        icon={<Radio className="size-6" />}
        title={t.liveTitle}
        tone="live"
      >
        {canJoin ? (
          <>
            <p className="max-w-md text-sm text-muted-foreground">{t.liveBody}</p>

            <Button
              size="lg"
              className="h-11 min-w-40 bg-live px-6 text-base text-white hover:bg-live/90"
              disabled={isJoining}
              onClick={() => void requestJoin()}
            >
              {isJoining ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  {t.joining}
                </>
              ) : (
                t.join
              )}
            </Button>
          </>
        ) : (
          <p className="max-w-md text-sm text-muted-foreground">
            {props.joinBlockedMessage ?? t.joinBlocked}
          </p>
        )}

        {join.kind === "error" ? (
          <div
            role="alert"
            className="mt-2 flex max-w-md items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-left text-sm text-destructive"
          >
            <CircleAlert
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            <div>
              <p className="font-medium">{t.errorTitle}</p>
              <p>{join.message}</p>
            </div>
          </div>
        ) : null}
      </StageMessage>
    );
  } else if (stage === "WAITING") {
    content = (
      <StageMessage icon={<Hourglass className="size-6" />} title={t.waitingTitle}>
        <p className="max-w-md text-sm text-muted-foreground">{t.waitingBody}</p>
      </StageMessage>
    );
  } else if (stage === "NOT_OPEN") {
    content = (
      <StageMessage
        icon={<CalendarClock className="size-6" />}
        title={t.notOpenTitle}
      >
        <Countdown
          startAt={props.scheduledStartAt}
          opensAt={props.joinOpensAt}
          serverTime={props.serverTime}
        />
        <p className="max-w-md text-sm text-muted-foreground">{t.notOpenBody}</p>
      </StageMessage>
    );
  } else {
    content = (
      <StageMessage icon={<Wrench className="size-6" />} title={t.notReadyTitle}>
        <p className="max-w-md text-sm text-muted-foreground">{t.notReadyBody}</p>
      </StageMessage>
    );
  }

  return (
    <section
      aria-label={t.regionLabel}
      className="flex min-h-[22rem] flex-col overflow-hidden rounded-xl border bg-card lg:min-h-[32rem]"
    >
      <div aria-live="polite" className="flex flex-1 flex-col">
        {content}
      </div>
    </section>
  );
}

/**
 * The classroom stage. Memoized and given only stable props, so panel interaction (tabs,
 * opening a PDF, playing a recording) never re-renders — let alone remounts — it.
 */
export const ClassroomStage = memo(ClassroomStageImpl);
