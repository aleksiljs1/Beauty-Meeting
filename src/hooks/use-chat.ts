"use client";

import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { chatText } from "@/i18n/chat";
import { onSignedOut } from "@/lib/api/auth-events";
import { apiGet } from "@/lib/api/client";
import type { ChatInbox } from "@/lib/chat";
import { subscribeChat } from "@/lib/realtime/client";

/**
 * One chat inbox per tab, shared by the header button (unread badge), the chat list and the chat
 * windows. Module-level store + useSyncExternalStore, like the live feed (use-live-feed.ts).
 *
 * Kept current by the realtime service's "chat:changed" signals (they carry no data: we refetch
 * GET /api/v1/chats), on window focus, and by a slow safety poll in case a signal was missed.
 * Offline users simply get everything on their next load.
 *
 * Laid out like Facebook's chat. On computers (DESKTOP_QUERY) the ✈ button drops down the chat
 * list, and each chat opens in a small window docked at the bottom right; minimized chats become
 * round bubbles on the right edge. A new message opens its chat's window, but nothing is marked
 * read until the reader touches it. On phones the chat list and the open chat fill the screen
 * instead, and a new message shows a toast with an "open" action.
 */

/** A docked chat window (computers). `NEW_CHAT_WINDOW` is the "new message" window with the people search. */
export type ChatWindow = {
  id: string;
  minimized: boolean;
  /** Opened by an incoming message, not by the reader: nothing is marked read until they touch it. */
  quiet: boolean;
  /** Minimized only for lack of room (not by the reader): opens again once there is room. */
  squeezed?: boolean;
};

/** A chat just started from the people search: not on the chat list until its first message. */
export type KnownChat = { title: string; personId: string; role: string };

export type ChatState = {
  inbox: ChatInbox | null;
  error: boolean;
  /** The chat list is open (drop-down on computers, full screen on phones). */
  open: boolean;
  /** Phones: the chat shown full screen (null = the list). */
  activeChatId: string | null;
  /** Computers: docked windows and bubbles, newest first (the newest sits furthest right). */
  windows: ChatWindow[];
  known: Record<string, KnownChat>;
  /** The chat waiting for "delete?" confirmation. */
  toDelete: { id: string; title: string } | null;
};

export const NEW_CHAT_WINDOW = "new";
export const DESKTOP_QUERY = "(min-width: 768px)";
const INITIAL: ChatState = { inbox: null, error: false, open: false, activeChatId: null, windows: [], known: {}, toDelete: null };
const SAFETY_POLL_MS = 60_000;
/** Open windows are kept per tab, so they survive a reload (like Facebook). */
const STORAGE_KEY = "chat-windows";
const WINDOW_WIDTH = 328;
const WINDOW_GAP = 12;
/** Room kept free on the right for the bubbles. */
const BUBBLE_COLUMN = 80;
const MAX_WINDOWS = 3;
const MAX_BUBBLES = 6;

let state: ChatState = INITIAL;
const listeners = new Set<() => void>();
let consumers = 0;
let inFlight: Promise<void> | null = null;
let refetchQueued = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let detach: (() => void) | null = null;

function setState(patch: Partial<ChatState>) {
  state = { ...state, ...patch };
  if ("windows" in patch || "known" in patch) saveWindows();
  listeners.forEach((listener) => listener());
}

const isVisible = () => typeof document === "undefined" || document.visibilityState === "visible";
export const isDesktop = () => typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches;

/** How many windows fit side by side next to the bubbles (at least one). */
function windowsThatFit() {
  const room = window.innerWidth - BUBBLE_COLUMN - 16;
  return Math.max(1, Math.min(MAX_WINDOWS, Math.floor(room / (WINDOW_WIDTH + WINDOW_GAP))));
}

/**
 * Newest first. Windows that want to be open (not minimized by the reader) beyond what fits are
 * squeezed into bubbles, and come back when there is room again (a window closed, a wider
 * screen). The "new message" window has no bubble: it closes instead. Bubbles beyond MAX_BUBBLES
 * are closed.
 */
function arrange(windows: ChatWindow[]): ChatWindow[] {
  const fit = windowsThatFit();
  let open = 0;
  let bubbles = 0;
  const arranged: ChatWindow[] = [];
  for (const w of windows) {
    const wantsOpen = !w.minimized || !!w.squeezed;
    const minimized = !wantsOpen || ++open > fit;
    const squeezed = wantsOpen && minimized;
    if (minimized && w.id === NEW_CHAT_WINDOW) continue;
    if (minimized && ++bubbles > MAX_BUBBLES) continue;
    arranged.push(minimized === w.minimized && squeezed === !!w.squeezed ? w : { ...w, minimized, squeezed });
  }
  return arranged;
}

function saveWindows() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ windows: state.windows.filter((w) => w.id !== NEW_CHAT_WINDOW), known: state.known }));
  } catch {
    // Private mode or storage blocked: windows just don't survive a reload.
  }
}

function loadWindows() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as { windows?: ChatWindow[]; known?: Record<string, KnownChat> } | null;
    if (!saved || !Array.isArray(saved.windows)) return;
    // Nothing is marked read just because the page reloaded.
    const windows = saved.windows.filter((w) => typeof w?.id === "string").map((w) => ({ id: w.id, minimized: !!w.minimized, squeezed: !!w.squeezed, quiet: true }));
    setState({ windows: arrange(windows), known: saved.known ?? {} });
  } catch {
    // Unreadable: start without windows.
  }
}

/**
 * A chat whose unread count went up: on computers its window opens (a minimized one just shows
 * the count on its bubble); on phones a toast, unless that chat is open on screen.
 */
function announceNewMessages(previous: ChatInbox | null, next: ChatInbox) {
  if (!previous) return; // first load: the badge says it, no burst of toasts or windows
  const desktop = isDesktop();
  for (const chat of next.chats) {
    const before = previous.chats.find((c) => c.id === chat.id)?.unread ?? 0;
    if (chat.unread <= before) continue;
    if (desktop) {
      if (!state.windows.some((w) => w.id === chat.id)) openWindow(chat.id, { quiet: true });
      continue;
    }
    if (state.open && state.activeChatId === chat.id) continue;
    toast(chatText.newMessageFrom(chat.title), {
      description: chat.lastMessage?.body ?? undefined,
      action: { label: chatText.openChat, onClick: () => openChats(chat.id) },
    });
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
  // A narrower browser window fits fewer chat windows: minimize the oldest.
  const onResize = () => {
    const arranged = arrange(state.windows);
    if (arranged.length !== state.windows.length || arranged.some((w, i) => w !== state.windows[i])) setState({ windows: arranged });
  };
  document.addEventListener("visibilitychange", onWake);
  window.addEventListener("focus", onWake);
  window.addEventListener("resize", onResize);
  const offSignedOut = onSignedOut(() => setState(INITIAL));
  detach = () => {
    unsubscribe();
    document.removeEventListener("visibilitychange", onWake);
    window.removeEventListener("focus", onWake);
    window.removeEventListener("resize", onResize);
    offSignedOut();
    clearTimeout(timer);
  };
}

function acquire() {
  consumers += 1;
  if (consumers === 1) {
    loadWindows();
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

/** Shared chat inbox, chat list and window state. */
export function useChat(): ChatState {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => INITIAL);
  useEffect(() => acquire(), []);
  return snapshot;
}

/** True on computers (docked windows), false on phones (full screen). */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(DESKTOP_QUERY);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

/** Opens the chats: on a chat if given (a toast, an email link), otherwise the chat list. */
export function openChats(chatId: string | null = null) {
  if (!isDesktop()) setState({ open: true, activeChatId: chatId });
  else if (chatId) {
    setState({ open: false });
    openWindow(chatId);
  } else setState({ open: true });
}

export function closeChats() {
  setState({ open: false, activeChatId: null });
}

/** Phones: switches the full-screen chats between the list (null) and a chat. */
export function showChat(chatId: string | null) {
  setState({ activeChatId: chatId });
}

/** Computers: opens (or brings back) a chat's docked window as the newest one. */
export function openWindow(chatId: string, { quiet = false } = {}) {
  const existing = state.windows.find((w) => w.id === chatId);
  // A window the reader is already using stays "theirs" when a message arrives.
  const stillQuiet = quiet && (!existing || existing.quiet || existing.minimized);
  const rest = state.windows.filter((w) => w.id !== chatId);
  setState({ windows: arrange([{ id: chatId, minimized: false, quiet: stillQuiet }, ...rest]) });
}

export function minimizeWindow(chatId: string) {
  setState({ windows: arrange(state.windows.map((w) => (w.id === chatId ? { ...w, minimized: true, squeezed: false } : w))) });
}

export function closeWindow(chatId: string) {
  if (state.windows.some((w) => w.id === chatId)) setState({ windows: arrange(state.windows.filter((w) => w.id !== chatId)) });
}

/** The reader clicked or typed in a window: from now on it marks messages read. */
export function touchWindow(chatId: string) {
  if (state.windows.some((w) => w.id === chatId && w.quiet)) setState({ windows: state.windows.map((w) => (w.id === chatId ? { ...w, quiet: false } : w)) });
}

/** Opens the "new message" window (people search), or brings it forward. */
export function openNewChatWindow() {
  setState({ open: false });
  openWindow(NEW_CHAT_WINDOW);
}

/** Swaps the "new message" window for the chat just started from it. */
export function replaceNewChatWindow(chatId: string) {
  closeWindow(NEW_CHAT_WINDOW);
  openWindow(chatId);
}

export function rememberChat(chatId: string, chat: KnownChat) {
  setState({ known: { ...state.known, [chatId]: chat } });
}

export function askDeleteChat(chat: { id: string; title: string } | null) {
  setState({ toDelete: chat });
}

/** Spacing for the docked windows (chat-dock.tsx). */
export const dockLayout = { WINDOW_WIDTH, WINDOW_GAP, BUBBLE_COLUMN };
