import "client-only";
import { io, type Socket } from "socket.io-client";
import { getAccessToken } from "@/lib/api/access-token";
import { onSignedOut } from "@/lib/api/auth-events";

/**
 * One Socket.IO connection per tab, shared by every component that needs live updates.
 * The server only sends "feed:changed" signals; listeners refetch through the normal API.
 * The connection authenticates with the in-memory access token and re-sends a fresh one
 * before it expires (the server disconnects sockets with expired tokens).
 */

const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL || undefined; // undefined = same origin
const REAUTH_CHECK_MS = 20_000;
const MAX_JITTER_MS = 400;
const MIN_RETRY_MS = 2_000;
const MAX_RETRY_MS = 60_000;

type Listener = (reason: "connected" | "changed") => void;

let socket: Socket | null = null;
let reauthTimer: ReturnType<typeof setInterval> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = MIN_RETRY_MS;
let lastToken: string | null = null;
const listeners = new Set<Listener>();

function notify(reason: "connected" | "changed") {
  // Spread refetches when a whole class receives the same signal at once.
  const delay = reason === "changed" ? Math.random() * MAX_JITTER_MS : 0;
  setTimeout(() => listeners.forEach((listener) => listener(reason)), delay);
}

function connect() {
  if (socket || typeof window === "undefined") return;
  socket = io(REALTIME_URL, {
    path: "/realtime",
    transports: ["websocket", "polling"],
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 30_000,
    // Called on every (re)connect, so reconnects always use a current token.
    auth: (callback) => {
      void getAccessToken()
        .catch(() => null)
        .then((token) => {
          lastToken = token;
          callback({ token: token ?? "" });
        });
    },
  });

  socket.on("connect", () => {
    retryDelay = MIN_RETRY_MS;
    notify("connected");
  });
  socket.on("feed:changed", () => notify("changed"));
  // Socket.IO only retries by itself after network drops. When the server closes the socket
  // (expired token, failed reauth) or rejects the handshake, it stays down: retry ourselves.
  socket.on("disconnect", (reason) => {
    if (reason === "io server disconnect") scheduleRetry();
  });
  socket.on("connect_error", () => {
    if (!socket?.active) scheduleRetry();
  });

  reauthTimer = setInterval(() => void reauth(), REAUTH_CHECK_MS);
  // Background tabs slow timers down, so the token may expire unnoticed: check on return.
  document.addEventListener("visibilitychange", onVisible);
}

async function reauth() {
  if (!socket?.connected) return;
  const token = await getAccessToken().catch(() => null);
  if (token && token !== lastToken && socket?.connected) {
    lastToken = token;
    socket.emit("reauth", token);
  }
}

function onVisible() {
  if (document.visibilityState !== "visible" || !socket) return;
  if (socket.connected) void reauth();
  else if (!socket.active) socket.connect();
}

function scheduleRetry() {
  if (retryTimer || !socket) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (socket && !socket.connected) socket.connect();
  }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
}

export function disconnectRealtime() {
  if (reauthTimer) clearInterval(reauthTimer);
  if (retryTimer) clearTimeout(retryTimer);
  reauthTimer = null;
  retryTimer = null;
  retryDelay = MIN_RETRY_MS;
  if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
  socket?.disconnect();
  socket = null;
  lastToken = null;
}

/** Subscribe to live updates; connects lazily on first subscriber, disconnects after the last. */
export function subscribeRealtime(listener: Listener): () => void {
  listeners.add(listener);
  connect();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) disconnectRealtime();
  };
}

export function isRealtimeConnected() {
  return socket?.connected ?? false;
}

onSignedOut(() => disconnectRealtime());
