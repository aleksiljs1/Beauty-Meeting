"use client";

import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { chatText } from "@/i18n/chat";
import { onSignedOut } from "@/lib/api/auth-events";
import { apiGet } from "@/lib/api/client";
import type { ChatInbox } from "@/lib/chat";
import { subscribeChat } from "@/lib/realtime/client";

/**
 * One chat inbox per tab, shared by the header button (unread badge) and the chat sidebar.
 * Module-level store + useSyncExternalStore, like the live feed (use-live-feed.ts).
 *
 * Kept current by the realtime service's "chat:changed" signals (they carry no data: we refetch
 * GET /api/v1/chats), on window focus, and by a slow safety poll in case a signal was missed.
 * Offline users simply get everything on their next load. A new message in a chat that isn't
 * open on screen shows a toast with an "open" action.
 */

export type ChatState = {
  inbox: ChatInbox | null;
  error: boolean;
  /** The sidebar is open, and which chat it shows (null = the chat list). */
  open: boolean;
  activeChatId: string | null;
};

const INITIAL: ChatState = { inbox: null, error: false, open: false, activeChatId: null };
const SAFETY_POLL_MS = 60_000;

let state: ChatState = INITIAL;
const listeners = new Set<() => void>();
let consumers = 0;
let inFlight: Promise<void> | null = null;
let refetchQueued = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let detach: (() => void) | null = null;

function setState(patch: Partial<ChatState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

const isVisible = () => typeof document === "undefined" || document.visibilityState === "visible";

/** Toasts for chats whose unread count went up, unless that chat is open on screen. */
function announceNewMessages(previous: ChatInbox | null, next: ChatInbox) {
  if (!previous) return; // first load: the badge says it, no burst of toasts
  for (const chat of next.chats) {
    const before = previous.chats.find((c) => c.id === chat.id)?.unread ?? 0;
    const onScreen = state.open && state.activeChatId === chat.id;
    if (chat.unread > before && !onScreen) {
      toast(chatText.newMessageFrom(chat.title), {
        description: chat.lastMessage?.body ?? undefined,
        action: { label: chatText.openChat, onClick: () => openChats(chat.id) },
      });
    }
  }
}

async function fetchOnce() {
  try {
    const inbox = await apiGet<ChatInbox>("/chats");
    if (consumers === 0) return;
    announceNewMessages(state.inbox, inbox);
    setState({ inbox, error: false });
  } catch {
    if (consumers > 0) setState({ error: true });
  }
}

/** Fetch now; a request already running is followed by exactly one more. */
export function refreshChats(): Promise<void> {
  if (inFlight) {
    refetchQueued = true;
    return inFlight;
  }
  inFlight = (async () => {
    do {
      refetchQueued = false;
      await fetchOnce();
    } while (refetchQueued && consumers > 0);
    inFlight = null;
  })();
  return inFlight.then(schedule);
}

function schedule() {
  clearTimeout(timer);
  if (consumers > 0 && isVisible()) timer = setTimeout(() => void refreshChats(), SAFETY_POLL_MS);
}

function attach() {
  const unsubscribe = subscribeChat(() => {
    if (isVisible()) void refreshChats();
  });
  const onWake = () => {
    if (isVisible()) void refreshChats();
    else clearTimeout(timer);
  };
  document.addEventListener("visibilitychange", onWake);
  window.addEventListener("focus", onWake);
  const offSignedOut = onSignedOut(() => setState(INITIAL));
  detach = () => {
    unsubscribe();
    document.removeEventListener("visibilitychange", onWake);
    window.removeEventListener("focus", onWake);
    offSignedOut();
    clearTimeout(timer);
  };
}

function acquire() {
  consumers += 1;
  if (consumers === 1) {
    attach();
    void refreshChats();
  }
  return () => {
    consumers -= 1;
    if (consumers === 0) {
      detach?.();
      detach = null;
      state = INITIAL;
    }
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Shared chat inbox and sidebar state. */
export function useChat(): ChatState {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => INITIAL);
  useEffect(() => acquire(), []);
  return snapshot;
}

/** Opens the sidebar, on a chat if given (e.g. from a "new message" toast). */
export function openChats(chatId: string | null = null) {
  setState({ open: true, activeChatId: chatId });
}

export function closeChats() {
  setState({ open: false, activeChatId: null });
}

/** Switches the open sidebar between the list (null) and a chat. */
export function showChat(chatId: string | null) {
  setState({ activeChatId: chatId });
}
