import { createServer, type Server as HttpServer } from "node:http";
import pg from "pg";
import { Server, type Socket } from "socket.io";

/**
 * Realtime service: pushes "your feed changed" signals to signed-in browsers.
 *
 * - Runs as its own small Node process (Next.js route handlers can't hold WebSockets).
 * - Auth: the same short-lived access JWT the Axios client uses; each socket joins only its
 *   own room `user:<id>`. Clients re-send a fresh token before it expires; sockets whose token
 *   expires are disconnected.
 * - Events carry NO data. On a signal the browser refetches through the normal, policy-checked
 *   API — authorization stays in one place and nothing private travels over the socket.
 * - Fan-in via Postgres LISTEN/NOTIFY (no Redis). After a database reconnect every client is
 *   told to resync, so events missed during the outage are never lost.
 */

export const REALTIME_CHANNEL = "academy_realtime";
export const REALTIME_PATH = "/realtime";
const MAX_SOCKETS_PER_USER = 10;
const EXPIRY_SWEEP_MS = 15_000;

export type TokenClaims = { userId: string; exp: number };
export type VerifyToken = (token: string) => Promise<TokenClaims | null>;

type SocketData = { userId: string; exp: number };
type ServerToClient = { "feed:changed": () => void };
type ClientToServer = { reauth: (token: unknown, ack?: (ok: boolean) => void) => void };
type AppSocket = Socket<ClientToServer, ServerToClient, Record<string, never>, SocketData>;

export type RealtimeOptions = {
  verifyToken: VerifyToken;
  databaseUrl: string;
  corsOrigins: string[];
  log?: Pick<Console, "info" | "warn" | "error">;
  /** How often expired connections are closed (tests use a short interval). */
  expirySweepMs?: number;
};

export function parseNotification(payload: string | undefined): string[] | "all" | null {
  if (!payload) return null;
  try {
    const message = JSON.parse(payload) as { type?: unknown; users?: unknown };
    if (message.type === "resync") return "all";
    if (message.type !== "feed" || !Array.isArray(message.users)) return null;
    const users = message.users.filter((u): u is string => typeof u === "string" && u.length > 0 && u.length <= 64);
    return users.length ? users.slice(0, 500) : null;
  } catch {
    return null;
  }
}

export function createRealtimeServer(options: RealtimeOptions) {
  const log = options.log ?? console;
  let listenerReady = false;

  const http: HttpServer = createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(listenerReady ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({ ok: listenerReady }));
      return;
    }
    response.writeHead(404).end();
  });

  const io = new Server<ClientToServer, ServerToClient, Record<string, never>, SocketData>(http, {
    path: REALTIME_PATH,
    serveClient: false,
    cors: { origin: options.corsOrigins, credentials: false },
    maxHttpBufferSize: 8 * 1024, // clients only ever send a token
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  io.use(async (socket, next) => {
    const token: unknown = socket.handshake.auth?.token;
    const claims = typeof token === "string" && token.length < 4096 ? await options.verifyToken(token) : null;
    if (!claims) return next(new Error("unauthorized"));
    const existing = await io.in(`user:${claims.userId}`).fetchSockets();
    if (existing.length >= MAX_SOCKETS_PER_USER) return next(new Error("too_many_connections"));
    socket.data.userId = claims.userId;
    socket.data.exp = claims.exp;
    next();
  });

  io.on("connection", (socket: AppSocket) => {
    void socket.join(`user:${socket.data.userId}`);

    // Fresh token before the old one expires; a token for a different user ends the connection.
    socket.on("reauth", async (token, ack) => {
      const claims = typeof token === "string" && token.length < 4096 ? await options.verifyToken(token) : null;
      if (!claims || claims.userId !== socket.data.userId) {
        ack?.(false);
        socket.disconnect(true);
        return;
      }
      socket.data.exp = claims.exp;
      ack?.(true);
    });
  });

  // Connections don't outlive their credentials.
  const sweep = setInterval(() => {
    const nowSeconds = Date.now() / 1000;
    for (const socket of io.sockets.sockets.values()) {
      if (socket.data.exp <= nowSeconds) socket.disconnect(true);
    }
  }, options.expirySweepMs ?? EXPIRY_SWEEP_MS);
  sweep.unref();

  // --- Postgres LISTEN with automatic reconnect -------------------------------------------
  let db: pg.Client | null = null;
  let stopped = false;
  let reconnectDelay = 1_000;
  let hasConnectedBefore = false;
  let reconnectTimer: NodeJS.Timeout | null = null;

  function dispatch(target: string[] | "all") {
    if (target === "all") io.emit("feed:changed");
    else io.to(target.map((id) => `user:${id}`)).emit("feed:changed");
  }

  function scheduleReconnect() {
    listenerReady = false;
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connectListener();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
  }

  async function connectListener() {
    const client = new pg.Client({ connectionString: options.databaseUrl });
    client.on("notification", (message) => {
      if (message.channel !== REALTIME_CHANNEL) return;
      const target = parseNotification(message.payload);
      if (target) dispatch(target);
    });
    client.on("error", (error) => {
      log.warn("[realtime] database connection error", error.message);
      void client.end().catch(() => undefined);
      if (db === client) db = null;
      scheduleReconnect();
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${REALTIME_CHANNEL}`);
      db = client;
      listenerReady = true;
      reconnectDelay = 1_000;
      if (hasConnectedBefore) dispatch("all"); // anything may have been missed while disconnected
      hasConnectedBefore = true;
      log.info("[realtime] listening for database notifications");
    } catch (error) {
      log.warn("[realtime] could not connect to database", (error as Error).message);
      void client.end().catch(() => undefined);
      scheduleReconnect();
    }
  }

  return {
    http,
    io,
    isReady: () => listenerReady,
    async start(port: number, host = "0.0.0.0") {
      await connectListener();
      await new Promise<void>((resolve) => http.listen(port, host, resolve));
      log.info(`[realtime] socket server on ${host}:${port}${REALTIME_PATH}`);
    },
    async stop() {
      stopped = true;
      clearInterval(sweep);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      io.disconnectSockets(true);
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await db?.end().catch(() => undefined);
    },
  };
}
