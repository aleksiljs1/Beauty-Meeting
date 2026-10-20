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

type Listener = (reason: "connected" | "changed") => void;

let socket: Socket | null = null;
let reauthTimer: ReturnType<typeof setInterval> | null = null;
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

  socket.on("connect", () => notify("connected"));
  socket.on("feed:changed", () => notify("changed"));

  reauthTimer = setInterval(async () => {
    if (!socket?.connected) return;
    const token = await getAccessToken().catch(() => null);
    if (token && token !== lastToken) {
      lastToken = token;
      socket.emit("reauth", token);
    }
  }, REAUTH_CHECK_MS);
}

export function disconnectRealtime() {
  if (reauthTimer) clearInterval(reauthTimer);
  reauthTimer = null;
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
