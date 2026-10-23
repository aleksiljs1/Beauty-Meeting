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
import { ZoomAppLink } from "@/components/zoom/zoom-app-link";
import { ZoomFrame } from "@/components/zoom/zoom-frame";
import { isZoomJoinConfig, useZoomFrame } from "@/hooks/use-zoom-frame";
import { zoomText } from "@/i18n/zoom";

const t = portalText.stage;

export type StageProps = {
  lessonId: string;
  lessonTitle: string;
  stage: StageState;
  canJoin: boolean;
  joinBlockedMessage: string | null;
  zoomAppFallback: boolean;
  scheduledStartAt: string;
  joinOpensAt: string;
  serverTime: string;
  hasRecordings: boolean;
  autoJoin: boolean;
  onShowRecordings: () => void;
};

type JoinState = { kind: "idle" } | { kind: "joining" } | { kind: "demo" } | { kind: "error"; message: string };

const errorMessage = (error: unknown) =>
  error instanceof ApiClientError || error instanceof Error ? error.message : portalText.states.errorBody;

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
  const zoom = useZoomFrame(portalText.states.errorBody);
  const startZoom = zoom.start;
  const autoJoinTried = useRef(false);

  const requestJoin = useCallback(async () => {
    setJoin({ kind: "joining" });
    try {
      // The server re-checks enrolment, deadline, join window and meeting state every time.
      const result = await apiSend<unknown>("post", `/lessons/${lessonId}/join`);
      if ((result as { mode?: unknown } | null)?.mode === "demo") {
        setJoin({ kind: "demo" });
        return;
      }
      if (!isZoomJoinConfig(result, "student", lessonId)) throw new Error(zoomText.frame.invalidResponse);
      setJoin({ kind: "idle" });
      startZoom(result);
    } catch (error) {
      setJoin({ kind: "error", message: errorMessage(error) });
    }
  }, [lessonId, startZoom]);

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

  const isJoining = join.kind === "joining";
  const joinError = join.kind === "error" ? join.message : zoom.status === "error" ? zoom.error : null;

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
  } else if (join.kind === "demo") {
    content = <DemoStage lessonTitle={props.lessonTitle} onLeave={() => setJoin({ kind: "idle" })} />;
  } else if (zoom.open) {
    content = (
      <div className="flex min-h-[22rem] flex-1 flex-col bg-black lg:min-h-[32rem]">
        <ZoomFrame frameRef={zoom.frameRef} frameKey={zoom.frameKey} title={zoomText.admin.frameTitle} className="h-[65vh] min-h-[28rem] flex-1" />
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

            {props.zoomAppFallback ? (
              <div className="mt-4 grid max-w-md gap-2 border-t pt-4">
                <p className="text-xs text-muted-foreground">{zoomText.student.appFallbackNote}</p>
                <ZoomAppLink
                  endpoint={`/lessons/${lessonId}/zoom-app-link`}
                  field="joinUrl"
                  labels={{
                    request: zoomText.student.appFallback,
                    preparing: zoomText.student.appFallbackPreparing,
                    ready: zoomText.student.appFallbackReady,
                    open: zoomText.student.appFallbackOpen,
                    error: zoomText.student.appFallbackError,
                  }}
                />
              </div>
            ) : null}
          </>
        ) : (
          <p className="max-w-md text-sm text-muted-foreground">
            {props.joinBlockedMessage ?? t.joinBlocked}
          </p>
        )}

        {joinError ? (
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
              <p>{joinError}</p>
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
