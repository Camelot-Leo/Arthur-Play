import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Writable } from "node:stream";
import { io as connect, type Socket } from "socket.io-client";
import { REALTIME_PATH, type ActivityContent } from "@arthur/shared";
import { SEED_TERMS, createLogger, createRedis, createSession, signTicket, type Redis } from "@arthur/shared/server";
import { ModerationStore } from "../src/moderation";
import { createRealtimeServer } from "../src/server";

export const SECRET = "test-secret-test-secret-test-secret-1234";

/** Avvia il servizio realtime in-process e cattura tutti i log in memoria. */
export async function startServer(opts: { pubsub?: boolean } = {}) {
  const redis = createRedis();
  const logLines: string[] = [];
  const sink = new Writable({
    write(chunk, _enc, cb) {
      logLines.push(String(chunk));
      cb();
    },
  });
  const logger = createLogger("realtime-test", sink);
  const httpServer = createServer();
  const pubsub = opts.pubsub ? { pub: createRedis(), sub: createRedis() } : undefined;
  const rt = createRealtimeServer({
    httpServer,
    redis,
    pubsub,
    moderation: new ModerationStore(null, SEED_TERMS),
    logger,
    ticketSecret: SECRET,
    corsOrigin: "*",
    trustProxy: false,
    sweepIntervalMs: 300,
  });
  await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", () => r()));
  const url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
  const sockets: Socket[] = [];
  return {
    redis,
    url,
    logLines,
    logger,
    track(s: Socket) {
      sockets.push(s);
      return s;
    },
    async stop() {
      for (const s of sockets) s.disconnect();
      await rt.close();
      httpServer.close();
      if (pubsub) {
        await pubsub.pub.quit();
        await pubsub.sub.quit();
      }
      await redis.quit();
    },
  };
}

export function socket(url: string, auth: Record<string, unknown>): Socket {
  return connect(url, { path: REALTIME_PATH, auth, transports: ["websocket"], forceNew: true, reconnection: false });
}

export function waitConnect(s: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (s.connected) return resolve();
    s.once("connect", () => resolve());
    s.once("connect_error", (e) => reject(e));
  });
}

export function emit<T = any>(s: Socket, ev: string, payload?: unknown): Promise<T> {
  return s.timeout(5000).emitWithAck(ev, payload) as Promise<T>;
}

export function nextEvent<T = any>(s: Socket, ev: string, pred: (p: T) => boolean = () => true, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      s.off(ev, h);
      reject(new Error(`timeout in attesa di ${ev}`));
    }, timeoutMs);
    const h = (p: T) => {
      if (pred(p)) {
        clearTimeout(t);
        s.off(ev, h);
        resolve(p);
      }
    };
    s.on(ev, h);
  });
}

export const activity: ActivityContent = {
  title: "Attività di prova",
  settings: { leaderboard: false, moderation: true },
  slides: [
    { id: "intro", type: "content", title: "Benvenuti", body: "Iniziamo", notes: "Nota segreta del facilitatore" },
    {
      id: "q1",
      type: "choice",
      question: "Come stai?",
      multiple: false,
      options: [
        { id: "a", label: "Bene" },
        { id: "b", label: "Così così" },
      ],
    },
    { id: "q2", type: "open", question: "Una parola sul lavoro di squadra", maxAnswers: 2 },
    { id: "q3", type: "wordcloud", question: "Tre parole", maxEntries: 3 },
    { id: "q4", type: "scale", question: "Quanto sei d'accordo?", max: 5, statements: [{ id: "s1", label: "Ascolto" }] },
  ],
};

export async function newSession(redis: Redis, ttlSeconds?: number) {
  const s = await createSession(redis, { ownerId: "owner-1", activity, ttlSeconds });
  const control = await signTicket(SECRET, { sid: s.sid, uid: "owner-1", role: "control" });
  const projection = await signTicket(SECRET, { sid: s.sid, uid: "owner-1", role: "projection" });
  return { ...s, control, projection };
}
