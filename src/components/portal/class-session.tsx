"use client";

import { Maximize2, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { ZoomFrame } from "@/components/zoom/zoom-frame";
import { useLiveFeed } from "@/hooks/use-live-feed";
import { useZoomFrame, type ZoomJoinConfig } from "@/hooks/use-zoom-frame";
import { portalText } from "@/i18n/portal";
import { zoomText } from "@/i18n/zoom";

/**
 * The student's Zoom call, owned by the portal shell so it survives page changes.
 *
 * A browser reloads an iframe whenever it moves in the DOM, which would drop the call, so the
 * frame never moves: it stays in one place in the tree and is only positioned with CSS. On the
 * lesson page it sits exactly over <ClassSlot>; everywhere else it shrinks to a corner player.
 */

type ClassSession = {
  /** The lesson of the latest join attempt (also identifies whose error `error` is). */
  lessonId: string | null;
  open: boolean;
  error: string | null;
  minimized: boolean;
  /** Counts "open the class" clicks, so a phone can switch back to its class tab. */
  restoreRequests: number;
  frameRef: RefObject<HTMLIFrameElement | null>;
  frameKey: number;
  slot: HTMLElement | null;
  start: (config: ZoomJoinConfig) => void;
  minimize: () => void;
  restore: () => void;
  /** Leaves the call (the frame closes). */
  leave: () => void;
  setSlot: (slot: HTMLElement | null) => void;
};

const ClassSessionContext = createContext<ClassSession | null>(null);

export function useClassSession() {
  const session = use(ClassSessionContext);
  if (!session) throw new Error("useClassSession must be used inside ClassSessionProvider");
  return session;
}

/** The lesson the student is in right now, or null (also outside the portal). */
export function useActiveClassLessonId() {
  const session = use(ClassSessionContext);
  return session?.open ? session.lessonId : null;
}

export function ClassSessionProvider({ children }: { children: ReactNode }) {
  const zoom = useZoomFrame(portalText.states.errorBody);
  const { frameRef, frameKey, open, error, start: startFrame, close } = zoom;
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [restoreRequests, setRestoreRequests] = useState(0);
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  // When the teacher ends the class, Zoom waits for an "OK" that the corner player can't take.
  const { feed } = useLiveFeed();
  const isLive = open && !!feed?.notifications.some((n) => n.lessonId === lessonId && n.type === "LESSON_LIVE" && n.active);
  // The lesson seen live in this session: only its end closes the class, so joining another lesson
  // (not live yet in the feed) doesn't close the new one straight away.
  const liveLessonId = useRef<string | null>(null);
  useEffect(() => {
    if (isLive) liveLessonId.current = lessonId;
    else if (open && lessonId && liveLessonId.current === lessonId) {
      liveLessonId.current = null;
      close();
    }
  }, [isLive, open, lessonId, close]);

  const start = useCallback(
    (config: ZoomJoinConfig) => {
      setLessonId(config.lessonId);
      setMinimized(false);
      startFrame(config);
    },
    [startFrame],
  );
  const minimize = useCallback(() => setMinimized(true), []);
  const restore = useCallback(() => {
    setMinimized(false);
    setRestoreRequests((count) => count + 1);
  }, []);

  const session = useMemo<ClassSession>(
    () => ({ lessonId, open, error, minimized, restoreRequests, frameRef, frameKey, slot, start, minimize, restore, leave: close, setSlot }),
    [lessonId, open, error, minimized, restoreRequests, frameRef, frameKey, slot, start, minimize, restore, close],
  );

  return (
    <ClassSessionContext value={session}>
      {children}
      {open ? <ClassWindow /> : null}
    </ClassSessionContext>
  );
}

/** Reserves the class's place on the lesson page; the frame is laid over it. */
export function ClassSlot({ className }: { className?: string }) {
  const { setSlot } = useClassSession();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setSlot(ref.current);
    return () => setSlot(null);
  }, [setSlot]);

  return <div ref={ref} className={className} />;
}

type Size = { width: number; height: number };
type Box = Size & { left: number; top: number };

const MINI_MAX: Size = { width: 240, height: 200 };

function ClassWindow() {
  const { lessonId, minimized, frameRef, frameKey, slot, restore, leave } = useClassSession();
  const router = useRouter();
  const pathname = usePathname();
  const [box, setBox] = useState<Box | null>(null);
  // Zoom keeps this layout while minimized: its controls break when the frame really gets small.
  const [frameSize, setFrameSize] = useState<Size>({ width: 960, height: 540 });

  useEffect(() => {
    if (!slot) return;
    const measure = () => {
      const { left, top, width, height } = slot.getBoundingClientRect();
      // Zero size: the phone is showing another tab and the slot is hidden.
      if (width === 0 || height === 0) return setBox(null);
      setBox({ left: left + window.scrollX, top: top + window.scrollY, width, height });
      setFrameSize({ width, height });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(slot);
    observer.observe(document.body); // content above the slot changing height moves it
    return () => observer.disconnect();
  }, [slot]);

  const docked = !minimized && slot && box ? box : null;

  // On a phone the bottom bar would cover Zoom's own controls (portal-shell hides it on this flag).
  const inClassView = docked !== null;
  useEffect(() => {
    if (!inClassView) return;
    document.documentElement.dataset.inClass = "";
    return () => {
      delete document.documentElement.dataset.inClass;
    };
  }, [inClassView]);

  const scale = Math.min(MINI_MAX.width / frameSize.width, MINI_MAX.height / frameSize.height);

  function openClass() {
    restore();
    const href = `/portal/mesimet/${lessonId}`;
    if (pathname !== href) router.push(href);
  }

  return (
    <div
      className={
        docked
          ? "absolute z-10"
          : "fixed right-3 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-40 overflow-hidden rounded-lg shadow-lg ring-1 ring-foreground/20 md:right-6 md:bottom-6"
      }
      style={docked ?? { width: frameSize.width * scale, height: frameSize.height * scale }}
    >
      <div
        className={docked ? "size-full" : "pointer-events-none origin-top-left"}
        style={docked ? undefined : { ...frameSize, transform: `scale(${scale})` }}
      >
        <ZoomFrame frameRef={frameRef} frameKey={frameKey} title={zoomText.admin.frameTitle} className="h-full" />
      </div>
      {docked ? null : (
        <button
          type="button"
          onClick={openClass}
          aria-label={portalText.stage.restore}
          title={portalText.stage.restore}
          className="absolute inset-0 flex items-start justify-end p-1.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
        >
          <span className="flex size-8 items-center justify-center rounded-md bg-black/60 text-white">
            <Maximize2 aria-hidden="true" className="size-4" />
          </span>
        </button>
      )}
      {docked ? null : (
        <button
          type="button"
          onClick={() => window.confirm(portalText.stage.leaveConfirm) && leave()}
          aria-label={portalText.stage.leave}
          title={portalText.stage.leave}
          className="absolute top-1.5 left-1.5 flex size-8 items-center justify-center rounded-md bg-black/60 text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      )}
    </div>
  );
}
