/**
 * Gamification (Fase 3): squadre, missione collettiva, classifiche.
 * Tutto in Redis con la scadenza della sessione; i punteggi sono legati solo all'hash del token.
 */
import type { Redis } from "ioredis";
import {
  LIMITS,
  isInteractive,
  missionState,
  rankTeams,
  teamsOf,
  type ActivityContent,
  type BoardMessage,
  type LeaderEntry,
  type MissionState,
  type TeamInfo,
} from "@arthur/shared";
import { K } from "@arthur/shared/server";

/**
 * Assegnazione bilanciata atomica (Lua): anche con centinaia di ingressi simultanei
 * la differenza tra la squadra più numerosa e la meno numerosa resta al massimo 1.
 * ARGV[1] = scadenza (ms), ARGV[2] = indice di partenza casuale, ARGV[3..] = id squadre.
 */
const ASSIGN_LUA = `
local n = #ARGV - 2
local best, min = nil, nil
for i = 0, n - 1 do
  local id = ARGV[3 + ((i + tonumber(ARGV[2])) % n)]
  local c = tonumber(redis.call('HGET', KEYS[1], id) or '0')
  if min == nil or c < min then min = c; best = id end
end
redis.call('HINCRBY', KEYS[1], best, 1)
redis.call('PEXPIREAT', KEYS[1], ARGV[1])
return best`;

export async function assignBalancedTeam(redis: Redis, sid: string, teams: TeamInfo[], expiresAt: number): Promise<string> {
  const offset = Math.floor(Math.random() * teams.length);
  return (await redis.eval(ASSIGN_LUA, 1, K.teams(sid), String(expiresAt), String(offset), ...teams.map((t) => t.id))) as string;
}

/** Scelta del partecipante: una sola volta, poi la squadra resta quella. */
export async function joinTeam(redis: Redis, sid: string, teamId: string, expiresAt: number): Promise<void> {
  await redis.multi().hincrby(K.teams(sid), teamId, 1).pexpireat(K.teams(sid), expiresAt).exec();
}

/** Missione: +1 risposta (solo per le missioni di tipo "answers"). */
export async function countMissionAnswer(redis: Redis, sid: string, expiresAt: number): Promise<void> {
  await redis.multi().hincrby(K.mission(sid), "answers", 1).pexpireat(K.mission(sid), expiresAt).exec();
}

/** Segna un quiz come svelato: da quel momento le sue risposte contano per la missione "correct". */
export async function markQuizRevealed(redis: Redis, sid: string, slideId: string, expiresAt: number): Promise<void> {
  await redis.multi().hset(K.mission(sid), `r:${slideId}`, "1").pexpireat(K.mission(sid), expiresAt).exec();
}

/**
 * Stato della missione. Per il tipo "correct" contano solo i quiz già svelati, così la barra
 * non rivela nulla sulle risposte mentre un quiz è ancora aperto. Il completamento è definitivo.
 */
export async function readMission(redis: Redis, sid: string, activity: ActivityContent, expiresAt: number): Promise<MissionState | null> {
  if (!activity.settings.mission?.enabled) return null;
  const h = await redis.hgetall(K.mission(sid));
  let correct = 0;
  let quizAnswers = 0;
  const revealed = Object.keys(h).filter((k) => k.startsWith("r:")).map((k) => k.slice(2));
  if (activity.settings.mission.type === "correct" && revealed.length) {
    const m = redis.multi();
    for (const id of revealed) m.hmget(K.agg(sid, id), "correct", "n");
    for (const [, v] of (await m.exec()) as [null, [string | null, string | null]][]) {
      correct += Number(v[0] ?? 0);
      quizAnswers += Number(v[1] ?? 0);
    }
  }
  const state = missionState(activity.settings, { answers: Number(h.answers ?? 0), correct, quizAnswers, done: h.done === "1" });
  if (state?.completed && h.done !== "1") {
    await redis.multi().hset(K.mission(sid), "done", "1").pexpireat(K.mission(sid), expiresAt).exec();
  }
  return state;
}

/** Classifica: solo tra squadre se attive, altrimenti individuale (se abilitata). */
export async function readBoard(redis: Redis, sid: string, activity: ActivityContent, withIndividuals: boolean): Promise<BoardMessage> {
  const teams = teamsOf(activity.settings);
  if (teams.length) {
    const [members, totals] = await Promise.all([redis.hgetall(K.teams(sid)), redis.zrange(K.teamScore(sid), 0, -1, "WITHSCORES")]);
    const tot: Record<string, number> = {};
    for (let i = 0; i < totals.length; i += 2) tot[totals[i]!] = Number(totals[i + 1]);
    const mem = Object.fromEntries(Object.entries(members).map(([k, v]) => [k, Number(v)]));
    return { teams: rankTeams(teams, mem, tot), top: null };
  }
  if (!activity.settings.leaderboard || !withIndividuals) return { teams: null, top: null };
  const raw = await redis.zrevrange(K.score(sid), 0, LIMITS.leaderboardTop - 1, "WITHSCORES");
  const hashes: string[] = [];
  const scores: number[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    hashes.push(raw[i]!);
    scores.push(Number(raw[i + 1]));
  }
  const nicks = hashes.length ? await redis.hmget(K.participants(sid), ...hashes) : [];
  const top: LeaderEntry[] = [];
  scores.forEach((score, i) => {
    const rank = i > 0 && score === scores[i - 1] ? top[i - 1]!.rank : i + 1;
    top.push({ nickname: nicks[i] ? (JSON.parse(nicks[i]!) as { n: string }).n : "—", score, rank });
  });
  return { teams: null, top };
}

/** Posizione personale del partecipante (e della sua squadra). */
export async function readStanding(redis: Redis, sid: string, activity: ActivityContent, tokenHash: string, teamIdOf: string | null) {
  const score = Number((await redis.zscore(K.score(sid), tokenHash)) ?? 0);
  const teams = teamsOf(activity.settings);
  if (teams.length) {
    const board = await readBoard(redis, sid, activity, false);
    const mine = board.teams?.find((t) => t.id === teamIdOf) ?? null;
    return {
      team: mine ? { id: mine.id, name: mine.name, index: mine.index } : null,
      teamRank: mine?.rank ?? null,
      teamScore: mine?.score ?? null,
      score,
      rank: null,
    };
  }
  let rank: number | null = null;
  if (activity.settings.leaderboard) {
    // Posizione = 1 + numero di punteggi strettamente maggiori (pari punteggio = pari posizione)
    rank = (await redis.zcount(K.score(sid), `(${score}`, "+inf")) + 1;
  }
  return { team: null, teamRank: null, teamScore: null, score, rank };
}

export const hasQuiz = (a: ActivityContent) => a.slides.some((s) => isInteractive(s) && s.type === "quiz");
