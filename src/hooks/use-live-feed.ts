"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getAccessToken } from "@/lib/api/access-token";
import { onSignedOut } from "@/lib/api/auth-events";
import { apiGet, apiSend } from "@/lib/api/client";
import { clearSessionHint, hasSessionHint } from "@/lib/api/session-hint";
import { nextPollDelay } from "@/lib/polling";
import type { FeedNotification, LiveFeed } from "@/server/services/live";

/**
 * One notification poller per tab, shared by every component that calls `useLiveFeed()`
 * (alert, bell, notification list). Module-level store + useSyncExternalStore, so mounting
 * several consumers never multiplies requests.
 *
 *  - Polls GET /api/v1/notifications every ~20 s while the tab is visible.
 *  - Refreshes immediately on start, after login (`refreshLiveFeed()`), on window focus and
 *    when the tab becomes visible again.
 *  - Exponential backoff on errors (capped at 2 min), see `nextPollDelay`.
 *  - Never runs for anonymous visitors: requires the session hint cookie AND a token.
 *  - Stops on sign-out (this tab or another one).
 *  - Pop-up dismissals are mirrored across tabs over BroadcastChannel("academy-alerts").
 */

export type { FeedNotification, LiveFeed };

export type LiveFeedState = {
  feed: LiveFeed | null;
  /** Last poll failed (the previous feed, if any, is kept). */
  error: boolean;
  /** Notifications dismissed in this browser but maybe not yet reflected by the server. */
  dismissed: ReadonlySet<string>;
};

const INITIAL: LiveFeedState = { feed: null, error: false, dismissed: new Set() };
const MIN_REFETCH_GAP_MS = 2_000;

let state: LiveFeedState = INITIAL;
const listeners = new Set<() => void>();

let consumers = 0;
let running = false;
let failures = 0;
let lastFetchAt = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight: Promise<void> | null = null;
let detach: (() => void) | null = null;
let channel: BroadcastChannel | null = null;

type AlertMessage = { type: "dismissed"; id: string } | { type: "refresh" };

function setState(patch: Partial<LiveFeedState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function isVisible() {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

async function fetchFeed(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      if (!hasSessionHint()) {
        stop();
        return;
      }
      let token: string | null;
      try {
        token = await getAccessToken();
      } catch {
        throw new Error("network"); // can't reach the server — not "signed out"
      }
      if (!token) {
        // The hint was stale (session gone): forget it so public pages stop trying.
        clearSessionHint();
        stop();
        setState({ feed: null, error: false });
        return;
      }
      const feed = await apiGet<LiveFeed>("/notifications");
      failures = 0;
      lastFetchAt = Date.now();
      if (running) setState({ feed, error: false });
    } catch {
      failures += 1;
      lastFetchAt = Date.now();
      if (running) setState({ error: true });
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function schedule() {
  clearTimeout(timer);
  timer = undefined;
  if (!running || !isVisible()) return;
  timer = setTimeout(() => {
    void fetchFeed().then(schedule);
  }, nextPollDelay(failures));
}

function start({ force = false } = {}) {
  if (consumers === 0 || !hasSessionHint()) return;
  running = true;
  if (!isVisible()) return; // resumes on visibilitychange
  if (!force && Date.now() - lastFetchAt < MIN_REFETCH_GAP_MS) {
    schedule();
    return;
  }
  void fetchFeed().then(schedule);
}

function stop() {
  running = false;
  clearTimeout(timer);
  timer = undefined;
}

function handleWake() {
  if (!isVisible()) {
    clearTimeout(timer);
    timer = undefined;
    return;
  }
  // Also picks up a login that happened in another tab (the hint cookie is shared).
  start();
}

function attach() {
  const onVisibility = () => handleWake();
  const onFocus = () => handleWake();
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", onFocus);

  const offSignedOut = onSignedOut(() => {
    clearSessionHint();
    stop();
    failures = 0;
    lastFetchAt = 0;
    setState({ feed: null, error: false, dismissed: new Set() });
  });

  channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("academy-alerts") : null;
  const onMessage = (event: MessageEvent<AlertMessage>) => {
    if (event.data?.type === "dismissed" && typeof event.data.id === "string") {
      setState({ dismissed: new Set(state.dismissed).add(event.data.id) });
    } else if (event.data?.type === "refresh") {
      start({ force: true });
    }
  };
  channel?.addEventListener("message", onMessage);

  detach = () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("focus", onFocus);
    offSignedOut();
    channel?.removeEventListener("message", onMessage);
    channel?.close();
    channel = null;
  };
}

function acquire() {
  consumers += 1;
  if (consumers === 1) attach();
  start();
  return () => {
    consumers -= 1;
    if (consumers === 0) {
      stop();
      detach?.();
      detach = null;
    }
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => state;
const getServerSnapshot = () => INITIAL;

/** Shared live feed. Starts the (single) poller while at least one component uses it. */
export function useLiveFeed(): LiveFeedState {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => acquire(), []);
  return snapshot;
}

/** Fetch now (e.g. right after login or after marking notifications read). */
export function refreshLiveFeed({ broadcast = false } = {}) {
  start({ force: true });
  if (broadcast) channel?.postMessage({ type: "refresh" } satisfies AlertMessage);
}

/** Hides the pop-up in every tab immediately, then records the dismissal on the server. */
export async function dismissLiveAlert(id: string) {
  setState({ dismissed: new Set(state.dismissed).add(id) });
  channel?.postMessage({ type: "dismissed", id } satisfies AlertMessage);
  try {
    await apiSend("post", `/notifications/${id}/dismiss`);
  } catch {
    // Best effort: the local/cross-tab dismissal already applies; the next poll may show it
    // again only if the request never reached the server.
  }
}

export function isDismissed(notification: FeedNotification, dismissed: ReadonlySet<string>) {
  return notification.dismissedAt !== null || dismissed.has(notification.id);
}
