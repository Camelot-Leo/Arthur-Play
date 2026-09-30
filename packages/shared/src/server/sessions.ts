import type { Redis } from "ioredis";
import { LIVE_SESSION_TTL_SECONDS } from "../limits";
import type { ActivityContent } from "../slides/schema";
import { randomCode, randomToken } from "./crypto";
import { K } from "./keys";

export type SessionMode = "live";

export type SessionMeta = {
  sid: string;
  code: string;
  ownerId: string;
  mode: SessionMode;
  status: "active" | "ended";
  index: number;
  resultsVisible: boolean;
  timerEnd: number | null;
  timerStart: number | null;
  quizTimerEnabled: boolean;
  timerFactor: number;
  view: "slide" | "leaderboard" | "podium";
  sounds: boolean;
  expiresAt: number;
  title: string;
};

export function parseMeta(sid: string, h: Record<string, string>): SessionMeta | null {
  if (!h || !h.code) return null;
  return {
    sid,
    code: h.code,
    ownerId: h.ownerId ?? "",
    mode: "live",
    status: h.status === "ended" ? "ended" : "active",
    index: Number(h.index ?? 0),
    resultsVisible: h.resultsVisible === "1",
    timerEnd: h.timerEnd ? Number(h.timerEnd) : null,
    timerStart: h.timerStart ? Number(h.timerStart) : null,
    quizTimerEnabled: h.quizTimer !== "0",
    timerFactor: [1, 1.5, 2].includes(Number(h.timerFactor)) ? Number(h.timerFactor) : 1,
    view: h.view === "leaderboard" || h.view === "podium" ? h.view : "slide",
    sounds: h.sounds !== "0",
    expiresAt: Number(h.expiresAt),
    title: h.title ?? "",
  };
}

export async function getMeta(redis: Redis, sid: string): Promise<SessionMeta | null> {
  return parseMeta(sid, await redis.hgetall(K.meta(sid)));
}

export async function getActivity(redis: Redis, sid: string): Promise<ActivityContent | null> {
  const raw = await redis.get(K.activity(sid));
  return raw ? (JSON.parse(raw) as ActivityContent) : null;
}

export async function sidByCode(redis: Redis, code: string): Promise<string | null> {
  if (!/^\d{6}$/.test(code)) return null;
  return redis.get(K.code(code));
}

/**
 * Crea una sessione live: fotografa l'attività in Redis e assegna un codice a 6 cifre.
 * Ogni chiave scade con la sessione (max 24 ore).
 */
export async function createSession(
  redis: Redis,
  opts: { ownerId: string; activity: ActivityContent; ttlSeconds?: number },
): Promise<{ sid: string; code: string; expiresAt: number }> {
  const sid = randomToken(12);
  const ttl = Math.min(opts.ttlSeconds ?? LIVE_SESSION_TTL_SECONDS, LIVE_SESSION_TTL_SECONDS);
  const expiresAt = Date.now() + ttl * 1000;

  let code: string | null = null;
  for (let i = 0; i < 50 && !code; i++) {
    const candidate = randomCode();
    const ok = await redis.set(K.code(candidate), sid, "PXAT", expiresAt, "NX");
    if (ok) code = candidate;
  }
  if (!code) throw new Error("Nessun codice disponibile");

  await redis
    .multi()
    .hset(K.meta(sid), {
      code,
      ownerId: opts.ownerId,
      mode: "live",
      status: "active",
      index: 0,
      resultsVisible: "1",
      timerEnd: "",
      timerStart: "",
      quizTimer: "1",
      timerFactor: "1",
      view: "slide",
      sounds: "1",
      expiresAt: String(expiresAt),
      title: opts.activity.title,
    })
    .pexpireat(K.meta(sid), expiresAt)
    .set(K.activity(sid), JSON.stringify(opts.activity), "PXAT", expiresAt)
    .sadd(K.userSessions(opts.ownerId), sid)
    .pexpireat(K.userSessions(opts.ownerId), expiresAt, "GT")
    .pexpireat(K.userSessions(opts.ownerId), expiresAt, "NX")
    .exec();

  return { sid, code, expiresAt };
}

/** Tutte le chiavi presenti di una sessione. */
export async function sessionKeys(redis: Redis, sid: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = "0";
  const match = `${K.prefix(sid).replace(/[*?[\]\\]/g, "\\$&")}*`;
  do {
    const [next, batch] = await redis.scan(cursor, "MATCH", match, "COUNT", 500);
    keys.push(...batch);
    cursor = next;
  } while (cursor !== "0");
  return keys;
}

/** Chiude la sessione e cancella definitivamente tutte le sue chiavi. */
export async function closeSession(redis: Redis, sid: string): Promise<void> {
  const meta = await getMeta(redis, sid);
  const keys = await sessionKeys(redis, sid);
  const multi = redis.multi();
  if (keys.length) multi.del(...keys);
  if (meta) {
    // Cancella il codice solo se punta ancora a questa sessione.
    multi.eval(
      "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0",
      1,
      K.code(meta.code),
      sid,
    );
    multi.srem(K.userSessions(meta.ownerId), sid);
  }
  await multi.exec();
}

/** Sessioni attive di un facilitatore (le scadute vengono rimosse dall'elenco). */
export async function listUserSessions(redis: Redis, userId: string): Promise<SessionMeta[]> {
  const sids = await redis.smembers(K.userSessions(userId));
  const out: SessionMeta[] = [];
  for (const sid of sids) {
    const meta = await getMeta(redis, sid);
    if (meta && meta.status === "active") out.push(meta);
    else await redis.srem(K.userSessions(userId), sid);
  }
  return out.sort((a, b) => b.expiresAt - a.expiresAt);
}
