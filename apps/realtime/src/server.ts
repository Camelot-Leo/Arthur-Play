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
  type ScreenView,
  type QuizAnswer,
  type Theme,
  isQuizCorrect,
  teamsOf,
  validateQaQuestion,
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
import { answeredCount, computeResults, qaAsk, qaItems, qaUpdate, qaVote, qaVotedBy, quizResultOf, setHidden, submitAnswer } from "./answers";
import type { ModerationStore } from "./moderation";
import { assignBalancedTeam, countMissionAnswer, joinTeam, markQuizRevealed, readBoard, readMission, readStanding } from "./gamification";

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
  /** Squadra del partecipante (null se non assegnata o modalità Squadre spenta). */
  team?: string | null;
};

type AppSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

/** Domande del Q&A inviate ai telefoni dei partecipanti. */
const QA_PUBLIC_MAX = 100;

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
    const locked = isInteractive(slide) ? await lockedNow(sid, meta, slide.id) : false;
    const state: SessionState = {
      status: "active",
      mode: meta.mode,
      index: meta.index,
      total: activity.slides.length,
      slide: toPublicSlide(slide),
      locked,
      resultsVisible: meta.resultsVisible,
      timerEnd: meta.timerEnd,
      now: Date.now(),
      quizTimer: { enabled: meta.quizTimerEnabled, factor: meta.timerFactor },
      // La soluzione del quiz arriva ai partecipanti solo a risposte chiuse.
      reveal:
        slide.type === "quiz" && locked
          ? slide.mode === "single"
            ? { correctOptionId: slide.correctOptionId }
            : { acceptedAnswers: slide.acceptedAnswers }
          : null,
      teams: activity.settings.teams?.enabled ? { mode: activity.settings.teams.mode, list: teamsOf(activity.settings) } : null,
      mission: await readMission(redis, sid, activity, meta.expiresAt),
      view: meta.view,
      sounds: meta.sounds,
      leaderboard: !!activity.settings.leaderboard && !activity.settings.teams?.enabled,
      themesVisible: meta.themesSlide === slide.id,
    };
    return { state, meta, activity };
  }

  async function participantsOnline(sid: string, mode: "live" | "async" = "live"): Promise<number> {
    // A ritmo libero conta chi ha iniziato l'attività (nessun dato individuale, solo il totale).
    if (mode === "async") return redis.hlen(K.participants(sid));
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
    const meta = await getMeta(redis, sid);
    io.to([r.screen, r.ctrl]).emit(EV.presence, { count: await participantsOnline(sid, meta?.mode) });
  }

  async function currentInteractive(sid: string) {
    const [meta, activity] = await Promise.all([getMeta(redis, sid), activityOf(sid)]);
    if (!meta || !activity || meta.status !== "active") return null;
    const slide = activity.slides[meta.index];
    return { meta, activity, slide: slide && isInteractive(slide) ? slide : null };
  }

  /**
   * Slide interattiva a cui è diretta una risposta: dal vivo deve essere quella corrente;
   * a ritmo libero può essere qualunque slide dell'attività.
   */
  async function targetInteractive(sid: string, slideId: unknown) {
    const [meta, activity] = await Promise.all([getMeta(redis, sid), activityOf(sid)]);
    if (!meta || !activity || meta.status !== "active") return { error: "ended" as const };
    if (typeof slideId !== "string") return { error: "invalid" as const };
    const slide = meta.mode === "async" ? activity.slides.find((x) => x.id === slideId) : activity.slides[meta.index];
    if (!slide || !isInteractive(slide) || slide.id !== slideId) return { error: "not_current" as const };
    return { meta, activity, slide };
  }

  async function readThemes(sid: string, slideId: string) {
    const raw = await redis.get(K.themes(sid, slideId));
    return raw ? (JSON.parse(raw) as Theme[]) : undefined;
  }

  /** Quiz già conteggiati per la missione (evita scritture ripetute). */
  const revealedQuizzes = new Map<string, Set<string>>();

  /** Missione e classifica: a tutti la missione, alla Regia sempre la classifica, alla Proiezione solo se la mostra. */
  async function flushGame(sid: string, meta: SessionMeta, activity: ActivityContent) {
    const r = rooms(sid);
    const mission = await readMission(redis, sid, activity, meta.expiresAt);
    if (mission) io.to([r.p, r.screen, r.ctrl]).emit(EV.mission, { value: mission.value, completed: mission.completed });
    if (activity.settings.teams?.enabled || activity.settings.leaderboard) {
      const board = await readBoard(redis, sid, activity, true);
      io.to(r.ctrl).emit(EV.board, board);
      if (meta.view !== "slide") io.to(r.screen).emit(EV.board, board);
    }
  }

  async function flushResults(sid: string) {
    const cur = await currentInteractive(sid);
    if (!cur) return;
    if (!cur.slide) return flushGame(sid, cur.meta, cur.activity);
    const r = rooms(sid);
    const revealed = cur.slide.type === "quiz" && (await lockedNow(sid, cur.meta, cur.slide.id));
    if (revealed) {
      const seen = revealedQuizzes.get(sid) ?? new Set<string>();
      if (!seen.has(cur.slide.id)) {
        await markQuizRevealed(redis, sid, cur.slide.id, cur.meta.expiresAt);
        seen.add(cur.slide.id);
        revealedQuizzes.set(sid, seen);
      }
    }
    const [screen, control] = await Promise.all([
      computeResults(redis, sid, cur.slide, false, revealed),
      computeResults(redis, sid, cur.slide, true, revealed),
    ]);
    // Temi AI: solo se il facilitatore li mostra (calcolati dal servizio web sui soli testi visibili).
    const themes = cur.meta.themesSlide === cur.slide.id ? await readThemes(sid, cur.slide.id) : undefined;
    io.to(r.ctrl).emit(EV.results, { slideId: cur.slide.id, data: control, themes });
    io.to(r.screen).emit(EV.results, { slideId: cur.slide.id, data: cur.meta.resultsVisible ? screen : null, themes: cur.meta.resultsVisible ? themes : undefined });
    // Q&A: l'elenco pubblico (senza autori, senza nascoste né filtrate) va anche ai partecipanti per votare.
    if (screen.type === "qa") io.to(r.p).emit(EV.qa, { slideId: cur.slide.id, items: screen.items.slice(0, QA_PUBLIC_MAX) });
    await flushGame(sid, cur.meta, cur.activity);
  }

  /** Invio dei risultati raggruppato: al massimo uno ogni RESULTS_THROTTLE_MS per sessione. */
  /** Ritmo libero: slide con nuove risposte, da inviare alla dashboard del facilitatore. */
  const dirtySlides = new Map<string, Set<string>>();

  async function flushAsync(sid: string) {
    const ids = dirtySlides.get(sid);
    dirtySlides.delete(sid);
    const activity = await activityOf(sid);
    if (!ids || !activity) return;
    for (const id of ids) {
      const slide = activity.slides.find((x) => x.id === id);
      if (slide && isInteractive(slide)) io.to(rooms(sid).ctrl).emit(EV.results, { slideId: id, data: await computeResults(redis, sid, slide, true, true) });
    }
  }

  function markDirty(sid: string, asyncSlideId?: string) {
    if (asyncSlideId) {
      const set = dirtySlides.get(sid) ?? new Set<string>();
      set.add(asyncSlideId);
      dirtySlides.set(sid, set);
      if (dirty.has(sid)) return;
      dirty.set(
        sid,
        setTimeout(() => {
          dirty.delete(sid);
          flushAsync(sid).catch((err) => logger.error({ err }, "flush risultati non riuscito"));
        }, RESULTS_THROTTLE_MS),
      );
      return;
    }
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
    dirtySlides.delete(sid);
    revealedQuizzes.delete(sid);
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
          broadcastPresence(sid).catch(() => {});
        }
      };
      const replyJoined = async (ack: (res: unknown) => void, token: string, nickname: string) => {
        const built = await buildState(sid);
        if (!built) return fail(ack, "ended");
        const slide = built.activity.slides[built.meta.index]!;
        const answered = isInteractive(slide) ? await answeredCount(redis, sid, slide.id, socket.data.tokenHash!) : 0;
        let asyncData = {};
        if (built.meta.mode === "async") {
          const interactive = built.activity.slides.filter(isInteractive);
          const m = redis.multi();
          for (const sl of interactive) m.hget(K.sub(sid, sl.id), socket.data.tokenHash!);
          const res = (await m.exec()) as [null, string | null][];
          const answeredSlides: Record<string, number> = {};
          interactive.forEach((sl, i) => {
            const n = Number(res[i]?.[1] ?? 0);
            if (n) answeredSlides[sl.id] = n;
          });
          asyncData = { slides: built.activity.slides.map((sl) => toPublicSlide(sl)), answeredSlides };
        }
        ack({ ok: true, token, nickname, answered, expiresAt: built.meta.expiresAt, team: socket.data.team ?? null, mode: built.meta.mode, ...asyncData });
        socket.emit(EV.state, built.state);
      };

      on(EV.info, async (_payload, ack) => {
        const meta = await getMeta(redis, sid);
        if (!meta || meta.status !== "active") return fail(ack, "ended");
        ack({ ok: true, mode: meta.mode, title: meta.title, expiresAt: meta.expiresAt });
      });

      on(EV.join, async (payload, ack) => {
        if (!(await hit(redis, socket.data.ipHash, "join", RATE.joinPerIp.limit, RATE.joinPerIp.window))) return fail(ack, "rate_limited");
        const meta = await getMeta(redis, sid);
        if (!meta || meta.status !== "active") return fail(ack, "ended");
        // A ritmo libero non serve alcun nickname: nessuna classifica, nessuna identità, solo il token tecnico.
        const isAsync = meta.mode === "async";
        let nickname = "";
        if (!isAsync) {
          const raw = (payload as { nickname?: unknown })?.nickname;
          if (typeof raw !== "string") return fail(ack, "nickname_invalid");
          nickname = cleanNickname(raw);
          if (nickname.length < LIMITS.nicknameMin || nickname.length > LIMITS.nicknameMax) return fail(ack, "nickname_invalid");
          if (moderation.isFiltered(nickname)) return fail(ack, "nickname_filtered");
          const added = await redis.sadd(K.nicks(sid), nickname.toLocaleLowerCase("it-IT"));
          if (!added) return fail(ack, "nickname_taken");
        }
        const token = randomToken(16);
        const tokenHash = sha256(token);
        // Squadre con assegnazione automatica: bilanciata e atomica già all'ingresso.
        const activity = await activityOf(sid);
        const teams = activity ? teamsOf(activity.settings) : [];
        const team = !isAsync && teams.length && activity!.settings.teams.mode === "auto" ? await assignBalancedTeam(redis, sid, teams, meta.expiresAt) : null;
        socket.data.team = team;
        await redis
          .multi()
          .pexpireat(K.nicks(sid), meta.expiresAt)
          .hset(K.participants(sid), tokenHash, JSON.stringify(team ? { n: nickname, t: team } : { n: nickname }))
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
        const { n, t } = JSON.parse(raw) as { n: string; t?: string };
        socket.data.team = t ?? null;
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
        const t = await targetInteractive(sid, p?.slideId);
        if ("error" in t) return fail(ack, t.error!);
        const cur = t;
        const isAsync = cur.meta.mode === "async";
        if (!isAsync && (await lockedNow(sid, cur.meta, cur.slide.id))) return fail(ack, "locked");
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
          quizTiming: !isAsync && cur.meta.timerStart && cur.meta.timerEnd ? { start: cur.meta.timerStart, end: cur.meta.timerEnd } : null,
          now: Date.now(),
          teamId: isAsync ? null : (socket.data.team ?? null),
          countMission: !isAsync && !!cur.activity.settings.mission?.enabled && cur.activity.settings.mission.type === "answers",
        });
        if (!res.ok) return fail(ack, res.error);
        markDirty(sid, isAsync ? cur.slide.id : undefined);
        // Ritmo libero: riscontro immediato del quiz, con soluzione e spiegazione.
        if (isAsync && cur.slide.type === "quiz") {
          const q = cur.slide;
          return ack({
            ok: true,
            answered: res.answered,
            feedback: {
              correct: isQuizCorrect(q, v.value as QuizAnswer),
              ...(q.mode === "single" ? { correctOptionId: q.correctOptionId } : { acceptedAnswers: q.acceptedAnswers }),
              ...(q.explanation ? { explanation: q.explanation } : {}),
            },
          });
        }
        ack({ ok: true, answered: res.answered });
      });

      /** Slide Q&A corrente, aperta, per un partecipante già entrato. */
      const currentQa = async (ack: (res: unknown) => void, slideId: unknown) => {
        if (!socket.data.tokenHash) return void fail(ack, "unauthorized");
        const t = await targetInteractive(sid, slideId);
        if ("error" in t) return void fail(ack, t.error!);
        if (t.slide.type !== "qa") return void fail(ack, "not_current");
        return t;
      };

      on(EV.qaState, async (payload, ack) => {
        const slideId = (payload as { slideId?: unknown })?.slideId;
        const cur = await currentQa(ack, slideId);
        if (!cur) return;
        const [items, voted, asked] = await Promise.all([
          qaItems(redis, sid, cur.slide!.id, false),
          qaVotedBy(redis, sid, cur.slide!.id, socket.data.tokenHash!),
          answeredCount(redis, sid, cur.slide!.id, socket.data.tokenHash!),
        ]);
        ack({ ok: true, items: items.slice(0, QA_PUBLIC_MAX), voted, asked });
      });

      on(EV.qaAsk, async (payload, ack) => {
        const p = payload as { slideId?: unknown; text?: unknown };
        const cur = await currentQa(ack, p?.slideId);
        if (!cur) return;
        if (!(await hit(redis, socket.data.tokenHash!, "answer", RATE.answerPerToken.limit, RATE.answerPerToken.window))) return fail(ack, "rate_limited");
        if (await lockedNow(sid, cur.meta, cur.slide!.id)) return fail(ack, "locked");
        const v = validateQaQuestion({ text: p.text });
        if (!v.ok) return fail(ack, "invalid");
        const moderationOn = cur.activity.settings?.moderation !== false;
        const res = await qaAsk(redis, {
          sid,
          slideId: cur.slide!.id,
          tokenHash: socket.data.tokenHash!,
          text: v.value,
          isFiltered: moderationOn ? moderation.isFiltered : () => false,
          expiresAt: cur.meta.expiresAt,
          max: LIMITS.qaQuestionsPerPersonMax,
        });
        if (!res.ok) return fail(ack, res.error);
        if (!res.filtered && cur.activity.settings.mission?.enabled && cur.activity.settings.mission.type === "answers") {
          await countMissionAnswer(redis, sid, cur.meta.expiresAt);
        }
        markDirty(sid, cur.meta.mode === "async" ? cur.slide!.id : undefined);
        ack({ ok: true, asked: res.asked });
      });

      on(EV.qaVote, async (payload, ack) => {
        const p = payload as { slideId?: unknown; qid?: unknown };
        const cur = await currentQa(ack, p?.slideId);
        if (!cur) return;
        if (typeof p.qid !== "string" || p.qid.length > 12) return fail(ack, "invalid");
        if (!(await hit(redis, socket.data.tokenHash!, "vote", RATE.answerPerToken.limit * 3, RATE.answerPerToken.window))) return fail(ack, "rate_limited");
        if (await lockedNow(sid, cur.meta, cur.slide!.id)) return fail(ack, "locked");
        const res = await qaVote(redis, { sid, slideId: cur.slide!.id, tokenHash: socket.data.tokenHash!, qid: p.qid, expiresAt: cur.meta.expiresAt });
        if (!res.ok) return fail(ack, res.error);
        markDirty(sid, cur.meta.mode === "async" ? cur.slide!.id : undefined);
        ack({ ok: true, votes: res.votes });
      });

      /** Esito personale del quiz, disponibile solo a risposte chiuse. */
      on(EV.myResult, async (payload, ack) => {
        const slideId = (payload as { slideId?: unknown })?.slideId;
        if (!socket.data.tokenHash) return fail(ack, "unauthorized");
        const cur = await currentInteractive(sid);
        if (!cur) return fail(ack, "ended");
        if (!cur.slide || cur.slide.type !== "quiz" || cur.slide.id !== slideId) return fail(ack, "not_current");
        if (!(await lockedNow(sid, cur.meta, cur.slide.id))) return fail(ack, "locked");
        ack({ ok: true, ...(await quizResultOf(redis, sid, cur.slide.id, socket.data.tokenHash)) });
      });

      /** Squadra scelta dal partecipante (modalità "choice"): una sola volta. */
      on(EV.chooseTeam, async (payload, ack) => {
        const tokenHash = socket.data.tokenHash;
        if (!tokenHash) return fail(ack, "unauthorized");
        const teamId = (payload as { teamId?: unknown })?.teamId;
        const [meta, activity] = await Promise.all([getMeta(redis, sid), activityOf(sid)]);
        if (!meta || !activity || meta.status !== "active") return fail(ack, "ended");
        const teams = teamsOf(activity.settings);
        if (activity.settings.teams.mode !== "choice" || !teams.some((t) => t.id === teamId)) return fail(ack, "invalid");
        const raw = await redis.hget(K.participants(sid), tokenHash);
        if (!raw) return fail(ack, "unauthorized");
        const p = JSON.parse(raw) as { n: string; t?: string };
        if (p.t) return ack({ ok: true, team: p.t });
        await joinTeam(redis, sid, teamId as string, meta.expiresAt);
        await redis.multi().hset(K.participants(sid), tokenHash, JSON.stringify({ ...p, t: teamId })).pexpireat(K.participants(sid), meta.expiresAt).exec();
        socket.data.team = teamId as string;
        markDirty(sid);
        ack({ ok: true, team: teamId });
      });

      /** Posizione personale e della propria squadra. */
      on(EV.standing, async (_payload, ack) => {
        const tokenHash = socket.data.tokenHash;
        if (!tokenHash) return fail(ack, "unauthorized");
        const activity = await activityOf(sid);
        if (!activity) return fail(ack, "ended");
        ack({ ok: true, ...(await readStanding(redis, sid, activity, tokenHash, socket.data.team ?? null)) });
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
        participants: await participantsOnline(sid, built.meta.mode),
        // Ritmo libero: la dashboard riceve subito gli aggregati di tutte le slide.
        ...(built.meta.mode === "async" && role === "control"
          ? {
              allResults: await Promise.all(
                built.activity.slides.filter(isInteractive).map(async (sl) => ({ slideId: sl.id, data: await computeResults(redis, sid, sl, true, true) })),
              ),
            }
          : {}),
      });
      if (built.meta.mode === "async") return;
      const slide = built.activity.slides[built.meta.index];
      if (slide && isInteractive(slide)) {
        const revealed = slide.type === "quiz" && built.state.locked;
        const data = await computeResults(redis, sid, slide, role === "control", revealed);
        const themes = built.meta.themesSlide === slide.id ? await readThemes(sid, slide.id) : undefined;
        const visible = role === "control" || built.meta.resultsVisible;
        socket.emit(EV.results, { slideId: slide.id, data: visible ? data : null, themes: visible ? themes : undefined });
      }
      if (built.activity.settings.teams?.enabled || built.activity.settings.leaderboard) {
        if (role === "control" || built.meta.view !== "slide") socket.emit(EV.board, await readBoard(redis, sid, built.activity, true));
      }
    });

    if (role !== "control") return;

    const withMeta = async (
      ack: (res: unknown) => void,
      fn: (meta: SessionMeta, activity: ActivityContent) => Promise<void>,
      opts: { asyncAllowed?: boolean } = {},
    ) => {
      const [meta, activity] = await Promise.all([getMeta(redis, sid), activityOf(sid)]);
      if (!meta || !activity || meta.status !== "active") return fail(ack, "ended");
      // I comandi di conduzione (avanzamento, timer, blocco, vista) non esistono a ritmo libero.
      if (meta.mode === "async" && !opts.asyncAllowed) return fail(ack, "invalid");
      await fn(meta, activity);
      ack({ ok: true });
    };

    /**
     * Cambio slide. Sui quiz con timer (se il facilitatore non l'ha disattivato) il timer parte
     * da solo, moltiplicato per il fattore scelto e mai oltre i 5 minuti. Un quiz già chiuso
     * non riparte, salvo con "Riapri" (`reopen`).
     */
    const goto = async (meta: SessionMeta, activity: ActivityContent, index: number, reopen = false) => {
      const i = Math.max(0, Math.min(activity.slides.length - 1, Math.floor(index)));
      const slide = activity.slides[i]!;
      const m = redis.multi();
      let end: number | null = null;
      const wasLocked = (await redis.sismember(K.locked(sid), slide.id)) === 1;
      if (reopen) m.srem(K.locked(sid), slide.id);
      if (slide.type === "quiz" && slide.timerSeconds && meta.quizTimerEnabled && (reopen || !wasLocked)) {
        const now = Date.now();
        end = now + Math.min(Math.round(slide.timerSeconds * meta.timerFactor), LIMITS.timerMaxSeconds) * 1000;
        m.hset(K.meta(sid), { index: i, timerStart: String(now), timerEnd: String(end), view: "slide", themesSlide: "" });
      } else {
        m.hset(K.meta(sid), { index: i, timerStart: "", timerEnd: "", view: "slide", themesSlide: "" });
      }
      await m.pexpireat(K.meta(sid), meta.expiresAt).exec();
      scheduleTimer(sid, end);
      return slide;
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
        await goto(meta, activity, index, true);
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
        const m = redis.multi().hset(K.meta(sid), { timerEnd: "", timerStart: "" }).pexpireat(K.meta(sid), meta.expiresAt);
        if (locked) m.sadd(K.locked(sid), slide.id).pexpireat(K.locked(sid), meta.expiresAt);
        else m.srem(K.locked(sid), slide.id);
        await m.exec();
        scheduleTimer(sid, null);
        await broadcastState(sid);
      });
    });

    on(EV.timer, async (payload, ack) => {
      const seconds = (payload as { seconds?: unknown })?.seconds;
      if (seconds !== null && (typeof seconds !== "number" || seconds < LIMITS.timerMinSeconds || seconds > LIMITS.timerMaxSeconds)) {
        return fail(ack, "invalid");
      }
      await withMeta(ack, async (meta, activity) => {
        const slide = activity.slides[meta.index];
        if (!slide || !isInteractive(slide)) return;
        const now = Date.now();
        const end = seconds === null ? null : now + Math.round(seconds) * 1000;
        const m = redis
          .multi()
          .hset(K.meta(sid), { timerStart: end ? String(now) : "", timerEnd: end ? String(end) : "" })
          .pexpireat(K.meta(sid), meta.expiresAt);
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
        // Estensione: il tempo residuo non supera mai i 5 minuti.
        const now = Date.now();
        const end = Math.min(Math.max(now, meta.timerEnd ?? now) + Math.round(seconds) * 1000, now + LIMITS.timerMaxSeconds * 1000);
        const start = meta.timerEnd && meta.timerEnd > now && meta.timerStart ? meta.timerStart : now;
        await redis
          .multi()
          .hset(K.meta(sid), { timerStart: String(start), timerEnd: String(end) })
          .pexpireat(K.meta(sid), meta.expiresAt)
          .srem(K.locked(sid), slide.id)
          .exec();
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
        if (slide.type === "qa") await qaUpdate(redis, { sid, slideId: slide.id, qid: p.itemId as string, hidden: p.hidden as boolean, expiresAt: meta.expiresAt });
        else await setHidden(redis, { sid, slide: slide as InteractiveSlide, itemId: p.itemId as string, hidden: p.hidden as boolean, expiresAt: meta.expiresAt });
        if (meta.mode === "async") markDirty(sid, slide.id);
        else await flushResults(sid);
      }, { asyncAllowed: true });
    });

    /** Q&A: segna una domanda come risposta (o la riporta in attesa). */
    on(EV.qaMark, async (payload, ack) => {
      const p = payload as { slideId?: unknown; qid?: unknown; answered?: unknown };
      if (typeof p?.slideId !== "string" || typeof p.qid !== "string" || typeof p.answered !== "boolean") return fail(ack, "invalid");
      await withMeta(ack, async (meta, activity) => {
        const slide = activity.slides.find((sl) => sl.id === p.slideId);
        if (!slide || slide.type !== "qa") return;
        await qaUpdate(redis, { sid, slideId: slide.id, qid: p.qid as string, answered: p.answered as boolean, expiresAt: meta.expiresAt });
        if (meta.mode === "async") markDirty(sid, slide.id);
        else await flushResults(sid);
      }, { asyncAllowed: true });
    });

    /** Cosa mostra la Proiezione: slide, classifica (squadre o individuale) o podio di squadra. */
    on(EV.view, async (payload, ack) => {
      const view = (payload as { view?: unknown })?.view as ScreenView;
      const act = await activityOf(sid);
      const teamsOn = !!act?.settings.teams?.enabled;
      const allowed = view === "slide" || (view === "leaderboard" && (teamsOn || !!act?.settings.leaderboard)) || (view === "podium" && teamsOn);
      if (!allowed) return fail(ack, "invalid");
      await withMeta(ack, async (meta, activity) => {
        await redis.multi().hset(K.meta(sid), "view", view).pexpireat(K.meta(sid), meta.expiresAt).exec();
        await broadcastState(sid);
        if (view !== "slide") io.to(rooms(sid).screen).emit(EV.board, await readBoard(redis, sid, activity, true));
      });
    });

    /** Temi AI della slide corrente: mostrati o nascosti in Proiezione. */
    on(EV.themes, async (payload, ack) => {
      const p = payload as { slideId?: unknown; visible?: unknown };
      if (typeof p?.slideId !== "string" || typeof p.visible !== "boolean") return fail(ack, "invalid");
      if (p.visible && !(await redis.exists(K.themes(sid, p.slideId)))) return fail(ack, "not_found");
      await withMeta(ack, async (meta, activity) => {
        if (activity.slides[meta.index]?.id !== p.slideId) return;
        await redis.multi().hset(K.meta(sid), "themesSlide", p.visible ? (p.slideId as string) : "").pexpireat(K.meta(sid), meta.expiresAt).exec();
        await broadcastState(sid);
      });
    });

    /** Suoni della Proiezione attivi o disattivati. */
    on(EV.sounds, async (payload, ack) => {
      const enabled = (payload as { enabled?: unknown })?.enabled;
      if (typeof enabled !== "boolean") return fail(ack, "invalid");
      await withMeta(ack, async (meta) => {
        await redis.multi().hset(K.meta(sid), "sounds", enabled ? "1" : "0").pexpireat(K.meta(sid), meta.expiresAt).exec();
        await broadcastState(sid);
      });
    });

    /** Timer dei quiz: disattivabile o allungabile (×1, ×1,5, ×2) — WCAG 2.2.1. */
    on(EV.quizTimer, async (payload, ack) => {
      const p = payload as { enabled?: unknown; factor?: unknown };
      if (typeof p?.enabled !== "boolean" || ![1, 1.5, 2].includes(p.factor as number)) return fail(ack, "invalid");
      await withMeta(ack, async (meta, activity) => {
        const m = redis.multi().hset(K.meta(sid), { quizTimer: p.enabled ? "1" : "0", timerFactor: String(p.factor) });
        const slide = activity.slides[meta.index];
        // Disattivando il timer durante un quiz, il timer in corso si ferma.
        if (!p.enabled && slide?.type === "quiz" && meta.timerEnd) {
          m.hset(K.meta(sid), { timerStart: "", timerEnd: "" });
          scheduleTimer(sid, null);
        }
        await m.pexpireat(K.meta(sid), meta.expiresAt).exec();
        await broadcastState(sid);
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
