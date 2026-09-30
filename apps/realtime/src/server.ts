/**
 * Servizio realtime di Arthur Play (Socket.IO).
 *
 * Stanze per sessione:
 * - partecipanti: ricevono solo lo stato (slide corrente, blocco, timer), mai i risultati altrui;
 * - screen (Proiezione): risultati visibili, senza voci nascoste né filtrate;
 * - ctrl (Regia): risultati completi di voci nascoste, conteggio delle filtrate, note.
 *
 * Nessun log contiene IP, nickname, testi o payload.
 */
import type { Server as HttpServer } from "node:http";
import { createAdapter } from "@socket.io/redis-adapter";
import type { Redis } from "ioredis";
import type { Logger } from "pino";
import { Server, type DefaultEventsMap, type Socket } from "socket.io";
import {
  EV,
  LIMITS,
  REALTIME_PATH,
  RESULTS_THROTTLE_MS,
  isInteractive,
  toPublicSlide,
  validateAnswer,
  type ActivityContent,
  type ErrorCode,
  type InteractiveSlide,
  type SessionState,
} from "@arthur/shared";
import {
  K,
  RATE,
  closeSession,
  getActivity,
  getMeta,
  hashIp,
  hit,
  randomToken,
  safeError,
  sha256,
  sidByCode,
  verifyTicket,
  type SessionMeta,
} from "@arthur/shared/server";
import { answeredCount, computeResults, setHidden, submitAnswer } from "./answers";
import type { ModerationStore } from "./moderation";

export type RealtimeOptions = {
  httpServer: HttpServer;
  redis: Redis;
  /** Client Redis per l'adapter pub/sub (più istanze). Facoltativo in sviluppo e test. */
  pubsub?: { pub: Redis; sub: Redis };
  moderation: ModerationStore;
  logger: Logger;
  ticketSecret: string;
  corsOrigin: string | string[];
  trustProxy: boolean;
  sweepIntervalMs?: number;
};

type SocketData = {
  role: "participant" | "control" | "projection";
  sid: string;
  ipHash: string;
  tokenHash?: string;
  counted?: boolean;
};

type AppSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

const rooms = (sid: string) => ({ p: `${sid}:p`, screen: `${sid}:screen`, ctrl: `${sid}:ctrl` });

const cleanNickname = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();

export function createRealtimeServer(opts: RealtimeOptions) {
  const { redis, logger, moderation } = opts;
  const instanceId = randomToken(6);

  const io = new Server(opts.httpServer, {
    path: REALTIME_PATH,
    serveClient: false,
    cors: { origin: opts.corsOrigin, credentials: false },
    maxHttpBufferSize: 16 * 1024,
    pingInterval: 20_000,
    pingTimeout: 20_000,
    connectionStateRecovery: undefined,
  });
  if (opts.pubsub) io.adapter(createAdapter(opts.pubsub.pub, opts.pubsub.sub));

  // Snapshot delle attività in memoria (immutabili per tutta la sessione).
  const activityCache = new Map<string, ActivityContent>();
  const timers = new Map<string, NodeJS.Timeout>();
  const dirty = new Map<string, NodeJS.Timeout>();

  async function activityOf(sid: string): Promise<ActivityContent | null> {
    const cached = activityCache.get(sid);
    if (cached) return cached;
    const a = await getActivity(redis, sid);
    if (a) activityCache.set(sid, a);
    return a;
  }

  async function lockedNow(sid: string, meta: SessionMeta, slideId: string): Promise<boolean> {
    if (meta.timerEnd && Date.now() >= meta.timerEnd) return true;
    return (await redis.sismember(K.locked(sid), slideId)) === 1;
  }

  async function buildState(sid: string): Promise<{ state: SessionState; meta: SessionMeta; activity: ActivityContent } | null> {
    const [meta, activity] = await Promise.all([getMeta(redis, sid), activityOf(sid)]);
    if (!meta || !activity || meta.status !== "active") return null;
    const slide = activity.slides[meta.index] ?? activity.slides[0]!;
    const state: SessionState = {
      status: "active",
      index: meta.index,
      total: activity.slides.length,
      slide: toPublicSlide(slide),
      locked: isInteractive(slide) ? await lockedNow(sid, meta, slide.id) : false,
      resultsVisible: meta.resultsVisible,
      timerEnd: meta.timerEnd,
      now: Date.now(),
    };
    return { state, meta, activity };
  }

  async function participantsOnline(sid: string): Promise<number> {
    const vals = await redis.hvals(K.online(sid));
    return vals.reduce((a, v) => a + Math.max(0, Number(v)), 0);
  }

  async function broadcastState(sid: string) {
    const built = await buildState(sid);
    if (!built) return;
    const r = rooms(sid);
    io.to([r.p, r.screen, r.ctrl]).emit(EV.state, built.state);
    await flushResults(sid);
  }

  async function broadcastPresence(sid: string) {
    const r = rooms(sid);
    io.to([r.screen, r.ctrl]).emit(EV.presence, { count: await participantsOnline(sid) });
  }

  async function currentInteractive(sid: string) {
    const [meta, activity] = await Promise.all([getMeta(redis, sid), activityOf(sid)]);
    if (!meta || !activity || meta.status !== "active") return null;
    const slide = activity.slides[meta.index];
    return { meta, activity, slide: slide && isInteractive(slide) ? slide : null };
  }

  async function flushResults(sid: string) {
    const cur = await currentInteractive(sid);
    if (!cur?.slide) return;
    const r = rooms(sid);
    const [screen, control] = await Promise.all([
      computeResults(redis, sid, cur.slide, false),
      computeResults(redis, sid, cur.slide, true),
    ]);
    io.to(r.ctrl).emit(EV.results, { slideId: cur.slide.id, data: control });
    io.to(r.screen).emit(EV.results, { slideId: cur.slide.id, data: cur.meta.resultsVisible ? screen : null });
  }

  /** Invio dei risultati raggruppato: al massimo uno ogni RESULTS_THROTTLE_MS per sessione. */
  function markDirty(sid: string) {
    if (dirty.has(sid)) return;
    dirty.set(
      sid,
      setTimeout(() => {
        dirty.delete(sid);
        flushResults(sid).catch((err) => logger.error({ err }, "flush risultati non riuscito"));
      }, RESULTS_THROTTLE_MS),
    );
  }

  function scheduleTimer(sid: string, timerEnd: number | null) {
    const prev = timers.get(sid);
    if (prev) clearTimeout(prev);
    timers.delete(sid);
    if (!timerEnd) return;
    const delay = Math.max(0, timerEnd - Date.now());
    timers.set(
      sid,
      setTimeout(async () => {
        timers.delete(sid);
        try {
          const cur = await currentInteractive(sid);
          if (cur?.slide && cur.meta.timerEnd === timerEnd) {
            await redis
              .multi()
              .sadd(K.locked(sid), cur.slide.id)
              .pexpireat(K.locked(sid), cur.meta.expiresAt)
              .hset(K.meta(sid), "timerEnd", "")
              .pexpireat(K.meta(sid), cur.meta.expiresAt)
              .exec();
          }
          await broadcastState(sid);
        } catch (err) {
          logger.error({ err }, "timer non riuscito");
        }
      }, delay),
    );
  }

  function forgetSession(sid: string) {
    activityCache.delete(sid);
    const t = timers.get(sid);
    if (t) clearTimeout(t);
    timers.delete(sid);
    const d = dirty.get(sid);
    if (d) clearTimeout(d);
    dirty.delete(sid);
  }

  async function endSession(sid: string) {
    const r = rooms(sid);
    io.to([r.p, r.screen, r.ctrl]).emit(EV.ended);
    forgetSession(sid);
    io.in([r.p, r.screen, r.ctrl]).disconnectSockets(true);
  }

  function clientIp(socket: AppSocket): string {
    if (opts.trustProxy) {
      const xff = socket.handshake.headers["x-forwarded-for"];
      const first = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim();
      if (first) return first;
    }
    return socket.handshake.address;
  }

  // ---- Autenticazione alla connessione ----
  io.use(async (socket: AppSocket, next) => {
    try {
      const ipHash = await hashIp(redis, clientIp(socket));
      if (!(await hit(redis, ipHash, "connect", RATE.connectPerIp.limit, RATE.connectPerIp.window))) {
        return next(new Error("rate_limited"));
      }
      const auth = (socket.handshake.auth ?? {}) as Record<string, unknown>;
      if (auth.role === "participant" && typeof auth.code === "string") {
        const sid = await sidByCode(redis, auth.code);
        if (!sid) return next(new Error("not_found"));
        socket.data = { role: "participant", sid, ipHash };
        return next();
      }
      if ((auth.role === "control" || auth.role === "projection") && typeof auth.ticket === "string") {
        const claims = await verifyTicket(opts.ticketSecret, auth.ticket);
        if (!claims || claims.role !== auth.role) return next(new Error("unauthorized"));
        const meta = await getMeta(redis, claims.sid);
        if (!meta || meta.ownerId !== claims.uid) return next(new Error("not_found"));
        socket.data = { role: claims.role, sid: claims.sid, ipHash };
        return next();
      }
      return next(new Error("unauthorized"));
    } catch (err) {
      logger.error({ err }, "errore in connessione");
      return next(new Error("invalid"));
    }
  });

  io.on("connection", (s) => {
    const socket = s as AppSocket;
    const { sid, role } = socket.data;
    const r = rooms(sid);
    const on = (event: string, handler: (payload: unknown, ack: (res: unknown) => void) => Promise<void>) => {
      socket.on(event, async (payload: unknown, ack: unknown) => {
        const reply = typeof ack === "function" ? (ack as (res: unknown) => void) : () => {};
        try {
          await handler(payload, reply);
        } catch (err) {
          logger.error({ err }, "errore nella gestione di un evento");
          reply({ ok: false, error: "invalid" satisfies ErrorCode });
        }
      });
    };
    const fail = (ack: (res: unknown) => void, error: ErrorCode) => ack({ ok: false, error });

    if (role === "participant") {
      const enterRoom = async (tokenHash: string) => {
        socket.data.tokenHash = tokenHash;
        if (!socket.data.counted) {
          socket.data.counted = true;
          await socket.join(r.p);
          const meta = await getMeta(redis, sid);
          if (meta) await redis.multi().hincrby(K.online(sid), instanceId, 1).pexpireat(K.online(sid), meta.expiresAt).exec();
          void broadcastPresence(sid);
        }
      };
      const replyJoined = async (ack: (res: unknown) => void, token: string, nickname: string) => {
        const built = await buildState(sid);
        if (!built) return fail(ack, "ended");
        const slide = built.activity.slides[built.meta.index]!;
        const answered = isInteractive(slide) ? await answeredCount(redis, sid, slide.id, socket.data.tokenHash!) : 0;
        ack({ ok: true, token, nickname, answered, expiresAt: built.meta.expiresAt });
        socket.emit(EV.state, built.state);
      };

      on(EV.join, async (payload, ack) => {
        if (!(await hit(redis, socket.data.ipHash, "join", RATE.joinPerIp.limit, RATE.joinPerIp.window))) return fail(ack, "rate_limited");
        const raw = (payload as { nickname?: unknown })?.nickname;
        if (typeof raw !== "string") return fail(ack, "nickname_invalid");
        const nickname = cleanNickname(raw);
        if (nickname.length < LIMITS.nicknameMin || nickname.length > LIMITS.nicknameMax) return fail(ack, "nickname_invalid");
        if (moderation.isFiltered(nickname)) return fail(ack, "nickname_filtered");
        const meta = await getMeta(redis, sid);
        if (!meta || meta.status !== "active") return fail(ack, "ended");
        const added = await redis.sadd(K.nicks(sid), nickname.toLocaleLowerCase("it-IT"));
        if (!added) return fail(ack, "nickname_taken");
        const token = randomToken(16);
        const tokenHash = sha256(token);
        await redis
          .multi()
          .pexpireat(K.nicks(sid), meta.expiresAt)
          .hset(K.participants(sid), tokenHash, JSON.stringify({ n: nickname }))
          .pexpireat(K.participants(sid), meta.expiresAt)
          .exec();
        await enterRoom(tokenHash);
        await replyJoined(ack, token, nickname);
      });

      on(EV.resume, async (payload, ack) => {
        if (!(await hit(redis, socket.data.ipHash, "join", RATE.joinPerIp.limit, RATE.joinPerIp.window))) return fail(ack, "rate_limited");
        const token = (payload as { token?: unknown })?.token;
        if (typeof token !== "string" || token.length > 64) return fail(ack, "not_found");
        const tokenHash = sha256(token);
        const raw = await redis.hget(K.participants(sid), tokenHash);
        if (!raw) return fail(ack, "not_found");
        const { n } = JSON.parse(raw) as { n: string };
        await enterRoom(tokenHash);
        await replyJoined(ack, token, n);
      });

      on(EV.answer, async (payload, ack) => {
        const tokenHash = socket.data.tokenHash;
        if (!tokenHash) return fail(ack, "unauthorized");
        const [okToken, okIp] = await Promise.all([
          hit(redis, tokenHash, "answer", RATE.answerPerToken.limit, RATE.answerPerToken.window),
          hit(redis, socket.data.ipHash, "answer", RATE.answerPerIp.limit, RATE.answerPerIp.window),
        ]);
        if (!okToken || !okIp) return fail(ack, "rate_limited");
        const p = payload as { slideId?: unknown; answer?: unknown };
        if (typeof p?.slideId !== "string") return fail(ack, "invalid");
        const cur = await currentInteractive(sid);
        if (!cur) return fail(ack, "ended");
        if (!cur.slide || cur.slide.id !== p.slideId) return fail(ack, "not_current");
        if (await lockedNow(sid, cur.meta, cur.slide.id)) return fail(ack, "locked");
        const v = validateAnswer(cur.slide, p.answer);
        if (!v.ok) return fail(ack, "invalid");
        const moderationOn = cur.activity.settings?.moderation !== false;
        const res = await submitAnswer(redis, {
          sid,
          slide: cur.slide,
          tokenHash,
          answer: v.value,
          isFiltered: moderationOn ? moderation.isFiltered : () => false,
          expiresAt: cur.meta.expiresAt,
        });
        if (!res.ok) return fail(ack, res.error);
        markDirty(sid);
        ack({ ok: true, answered: res.answered });
      });

      socket.on("disconnect", () => {
        if (!socket.data.counted) return;
        // Decremento solo se la chiave esiste ancora: una sessione chiusa non va ricreata.
        redis
          .eval("if redis.call('EXISTS', KEYS[1]) == 1 then return redis.call('HINCRBY', KEYS[1], ARGV[1], -1) end return 0", 1, K.online(sid), instanceId)
          .then(() => broadcastPresence(sid))
          .catch(() => {});
      });
      return;
    }

    // ---- Regia e Proiezione ----
    void socket.join(role === "control" ? r.ctrl : r.screen);

    on(EV.init, async (_payload, ack) => {
      const built = await buildState(sid);
      if (!built) return fail(ack, "ended");
      const activity =
        role === "control"
          ? built.activity
          : { ...built.activity, slides: built.activity.slides.map((sl) => toPublicSlide(sl)) };
      ack({
        ok: true,
        activity,
        state: built.state,
        code: built.meta.code,
        expiresAt: built.meta.expiresAt,
        participants: await participantsOnline(sid),
      });
      const slide = built.activity.slides[built.meta.index];
      if (slide && isInteractive(slide)) {
        const data = await computeResults(redis, sid, slide, role === "control");
        socket.emit(EV.results, { slideId: slide.id, data: role === "control" || built.meta.resultsVisible ? data : null });
      }
    });

    if (role !== "control") return;

    const withMeta = async (ack: (res: unknown) => void, fn: (meta: SessionMeta, activity: ActivityContent) => Promise<void>) => {
      const [meta, activity] = await Promise.all([getMeta(redis, sid), activityOf(sid)]);
      if (!meta || !activity || meta.status !== "active") return fail(ack, "ended");
      await fn(meta, activity);
      ack({ ok: true });
    };

    const goto = async (meta: SessionMeta, activity: ActivityContent, index: number) => {
      const i = Math.max(0, Math.min(activity.slides.length - 1, Math.floor(index)));
      await redis.multi().hset(K.meta(sid), { index: i, timerEnd: "" }).pexpireat(K.meta(sid), meta.expiresAt).exec();
      scheduleTimer(sid, null);
      return activity.slides[i]!;
    };

    on(EV.goto, async (payload, ack) => {
      const index = (payload as { index?: unknown })?.index;
      if (typeof index !== "number" || !Number.isFinite(index)) return fail(ack, "invalid");
      await withMeta(ack, async (meta, activity) => {
        await goto(meta, activity, index);
        await broadcastState(sid);
      });
    });

    on(EV.reopen, async (payload, ack) => {
      const index = (payload as { index?: unknown })?.index;
      if (typeof index !== "number" || !Number.isFinite(index)) return fail(ack, "invalid");
      await withMeta(ack, async (meta, activity) => {
        const slide = await goto(meta, activity, index);
        await redis.srem(K.locked(sid), slide.id);
        await broadcastState(sid);
      });
    });

    on(EV.showResults, async (payload, ack) => {
      const visible = (payload as { visible?: unknown })?.visible;
      if (typeof visible !== "boolean") return fail(ack, "invalid");
      await withMeta(ack, async (meta) => {
        await redis.multi().hset(K.meta(sid), "resultsVisible", visible ? "1" : "0").pexpireat(K.meta(sid), meta.expiresAt).exec();
        await broadcastState(sid);
      });
    });

    on(EV.lock, async (payload, ack) => {
      const locked = (payload as { locked?: unknown })?.locked;
      if (typeof locked !== "boolean") return fail(ack, "invalid");
      await withMeta(ack, async (meta, activity) => {
        const slide = activity.slides[meta.index];
        if (!slide || !isInteractive(slide)) return;
        const m = redis.multi().hset(K.meta(sid), "timerEnd", "").pexpireat(K.meta(sid), meta.expiresAt);
        if (locked) m.sadd(K.locked(sid), slide.id).pexpireat(K.locked(sid), meta.expiresAt);
        else m.srem(K.locked(sid), slide.id);
        await m.exec();
        scheduleTimer(sid, null);
        await broadcastState(sid);
      });
    });

    on(EV.timer, async (payload, ack) => {
      const seconds = (payload as { seconds?: unknown })?.seconds;
      if (seconds !== null && (typeof seconds !== "number" || seconds < 5 || seconds > LIMITS.timerMaxSeconds)) return fail(ack, "invalid");
      await withMeta(ack, async (meta, activity) => {
        const slide = activity.slides[meta.index];
        if (!slide || !isInteractive(slide)) return;
        const end = seconds === null ? null : Date.now() + Math.round(seconds) * 1000;
        const m = redis.multi().hset(K.meta(sid), "timerEnd", end ? String(end) : "").pexpireat(K.meta(sid), meta.expiresAt);
        if (end) m.srem(K.locked(sid), slide.id);
        await m.exec();
        scheduleTimer(sid, end);
        await broadcastState(sid);
      });
    });

    on(EV.timerAdd, async (payload, ack) => {
      const seconds = (payload as { seconds?: unknown })?.seconds;
      if (typeof seconds !== "number" || seconds < 1 || seconds > LIMITS.timerMaxSeconds) return fail(ack, "invalid");
      await withMeta(ack, async (meta, activity) => {
        const slide = activity.slides[meta.index];
        if (!slide || !isInteractive(slide)) return;
        const end = Math.max(Date.now(), meta.timerEnd ?? Date.now()) + Math.round(seconds) * 1000;
        await redis.multi().hset(K.meta(sid), "timerEnd", String(end)).pexpireat(K.meta(sid), meta.expiresAt).srem(K.locked(sid), slide.id).exec();
        scheduleTimer(sid, end);
        await broadcastState(sid);
      });
    });

    on(EV.hide, async (payload, ack) => {
      const p = payload as { slideId?: unknown; itemId?: unknown; hidden?: unknown };
      if (typeof p?.slideId !== "string" || typeof p.itemId !== "string" || typeof p.hidden !== "boolean") return fail(ack, "invalid");
      await withMeta(ack, async (meta, activity) => {
        const slide = activity.slides.find((sl) => sl.id === p.slideId);
        if (!slide || !isInteractive(slide)) return;
        await setHidden(redis, { sid, slide: slide as InteractiveSlide, itemId: p.itemId as string, hidden: p.hidden as boolean, expiresAt: meta.expiresAt });
        await flushResults(sid);
      });
    });

    on(EV.close, async (_payload, ack) => {
      await closeSession(redis, sid);
      ack({ ok: true });
      logger.info({ event: "session_closed" }, "sessione chiusa e dati cancellati");
      await endSession(sid);
    });
  });

  // Sessioni scadute (TTL Redis): avvisa i client ancora connessi e libera la memoria.
  const sweep = setInterval(async () => {
    try {
      const sids = new Set<string>();
      for (const room of io.of("/").adapter.rooms.keys()) {
        const m = /^(.+):(p|screen|ctrl)$/.exec(room);
        if (m) sids.add(m[1]!);
      }
      for (const sid of sids) {
        if (!(await redis.exists(K.meta(sid)))) await endSession(sid);
      }
    } catch (err) {
      logger.error({ err }, "controllo scadenze non riuscito");
    }
  }, opts.sweepIntervalMs ?? 30_000);

  return {
    io,
    instanceId,
    async close() {
      clearInterval(sweep);
      for (const t of timers.values()) clearTimeout(t);
      for (const t of dirty.values()) clearTimeout(t);
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}

export { safeError };
