/**
 * Registrazione delle risposte e calcolo degli aggregati in Redis.
 * I testi (risposte aperte, voci della word cloud) sono salvati senza alcun legame con
 * il token o il nickname: il token serve solo a contare gli invii per impedire i doppi.
 * Le risposte filtrate dalla moderazione non vengono salvate: se ne conta solo il numero.
 */
import type { Redis } from "ioredis";
import type {
  Answer,
  ChoiceAnswer,
  InteractiveSlide,
  OpenItem,
  OpenResults,
  ScaleAnswer,
  ScaleStat,
  SlideResults,
  WordcloudAnswer,
  OpenAnswer,
  WordItem,
  GridAnswer,
  RankingAnswer,
  PointsAnswer,
  QuizAnswer,
  QaItem,
  QuizTiming,
} from "@arthur/shared";
import { isQuizCorrect, quizPoints, wordKey } from "@arthur/shared";
import { K } from "@arthur/shared/server";

export const maxSubmissions = (slide: InteractiveSlide) => (slide.type === "open" ? slide.maxAnswers : 1);

export type SubmitResult = { ok: true; answered: number } | { ok: false; error: "already_answered" };

/** Quante volte questo token ha già risposto alla slide. */
export async function answeredCount(redis: Redis, sid: string, slideId: string, tokenHash: string): Promise<number> {
  return Number((await redis.hget(K.sub(sid, slideId), tokenHash)) ?? 0);
}

export async function submitAnswer(
  redis: Redis,
  opts: {
    sid: string;
    slide: InteractiveSlide;
    tokenHash: string;
    answer: Answer;
    isFiltered: (text: string) => boolean;
    expiresAt: number;
    /** Solo quiz: durata del timer attivo (null = timer disattivato) e istante della risposta. */
    quizTiming?: QuizTiming;
    now?: number;
    /** Squadra del partecipante: i punti del quiz si sommano anche alla squadra. */
    teamId?: string | null;
    /** Missione "answers": ogni risposta accettata conta. */
    countMission?: boolean;
  },
): Promise<SubmitResult> {
  const { sid, slide, tokenHash, answer, isFiltered, expiresAt } = opts;
  const subKey = K.sub(sid, slide.id);
  const aggKey = K.agg(sid, slide.id);
  const txtKey = K.txt(sid, slide.id);

  // Blocco dei doppi invii: contatore atomico per token.
  const count = await redis.hincrby(subKey, tokenHash, 1);
  if (count > maxSubmissions(slide)) {
    await redis.hincrby(subKey, tokenHash, -1);
    return { ok: false, error: "already_answered" };
  }

  const m = redis.multi();
  m.pexpireat(subKey, expiresAt);
  if (count === 1) m.hincrby(aggKey, "n", 1);

  switch (slide.type) {
    case "choice": {
      for (const id of (answer as ChoiceAnswer).optionIds) m.hincrby(aggKey, `o:${id}`, 1);
      break;
    }
    case "scale": {
      for (const [stmt, v] of Object.entries((answer as ScaleAnswer).values)) {
        m.hincrby(aggKey, `c:${stmt}`, 1);
        m.hincrby(aggKey, `s:${stmt}`, v);
        m.hincrby(aggKey, `d:${stmt}:${v}`, 1);
      }
      break;
    }
    case "open": {
      const text = (answer as OpenAnswer).text;
      if (isFiltered(text)) m.hincrby(aggKey, "filtered", 1);
      else {
        const id = await redis.hincrby(aggKey, "seq", 1);
        m.hset(txtKey, String(id), JSON.stringify({ t: text }));
        m.pexpireat(txtKey, expiresAt);
      }
      break;
    }
    case "wordcloud": {
      for (const w of (answer as WordcloudAnswer).words) {
        if (isFiltered(w)) m.hincrby(aggKey, "filtered", 1);
        else m.hincrby(txtKey, wordKey(w), 1);
      }
      m.pexpireat(txtKey, expiresAt);
      break;
    }
    case "grid": {
      for (const [item, pos] of Object.entries((answer as GridAnswer).positions)) {
        m.hincrby(aggKey, `c:${item}`, 1);
        m.hincrby(aggKey, `x:${item}`, pos.x);
        m.hincrby(aggKey, `y:${item}`, pos.y);
      }
      break;
    }
    case "ranking": {
      (answer as RankingAnswer).order.forEach((opt, i) => m.hincrby(aggKey, `r:${opt}`, i + 1));
      break;
    }
    case "points": {
      for (const [opt, v] of Object.entries((answer as PointsAnswer).points)) m.hincrby(aggKey, `p:${opt}`, v);
      break;
    }
    case "quiz": {
      const a = answer as QuizAnswer;
      const correct = isQuizCorrect(slide, a);
      const points = quizPoints(correct, opts.quizTiming ?? null, opts.now ?? Date.now());
      if ("optionId" in a) m.hincrby(aggKey, `o:${a.optionId}`, 1);
      if (correct) m.hincrby(aggKey, "correct", 1);
      const quizKey = K.quiz(sid, slide.id);
      m.hset(quizKey, tokenHash, JSON.stringify({ c: correct ? 1 : 0, p: points }));
      m.pexpireat(quizKey, expiresAt);
      m.zincrby(K.score(sid), points, tokenHash);
      m.pexpireat(K.score(sid), expiresAt);
      if (opts.teamId) {
        m.zincrby(K.teamScore(sid), points, opts.teamId);
        m.pexpireat(K.teamScore(sid), expiresAt);
      }
      break;
    }
    case "qa":
      break;
  }
  m.pexpireat(aggKey, expiresAt);
  if (opts.countMission) m.hincrby(K.mission(sid), "answers", 1).pexpireat(K.mission(sid), expiresAt);
  await m.exec();
  return { ok: true, answered: count };
}

const PROJECTION_OPEN_ITEMS = 100;
const CONTROL_OPEN_ITEMS = 500;
const WORDS_MAX = 80;

/**
 * Risultati aggregati della slide.
 * `forControl`: la Regia vede anche le voci nascoste (per poterle ripristinare);
 * la Proiezione vede solo quelle visibili. Le filtrate non compaiono mai.
 */
export async function computeResults(
  redis: Redis,
  sid: string,
  slide: InteractiveSlide,
  forControl: boolean,
  revealed = false,
): Promise<SlideResults> {
  const agg = await redis.hgetall(K.agg(sid, slide.id));
  const num = (k: string) => Number(agg[k] ?? 0);
  const respondents = num("n");

  switch (slide.type) {
    case "choice": {
      const counts: Record<string, number> = {};
      for (const o of slide.options) counts[o.id] = num(`o:${o.id}`);
      return { type: "choice", respondents, counts };
    }
    case "scale": {
      const stats: Record<string, ScaleStat> = {};
      for (const s of slide.statements) {
        const count = num(`c:${s.id}`);
        const dist = Array.from({ length: slide.max }, (_, i) => num(`d:${s.id}:${i + 1}`));
        stats[s.id] = { count, avg: count ? num(`s:${s.id}`) / count : 0, dist };
      }
      return { type: "scale", respondents, stats };
    }
    case "open": {
      const raw = await redis.hgetall(K.txt(sid, slide.id));
      const all: OpenItem[] = Object.entries(raw)
        .map(([id, v]) => {
          const parsed = JSON.parse(v) as { t: string; h?: 1 };
          return { id, text: parsed.t, hidden: parsed.h === 1 };
        })
        .sort((a, b) => Number(b.id) - Number(a.id));
      const visible = all.filter((i) => !i.hidden);
      const items = forControl
        ? all.slice(0, CONTROL_OPEN_ITEMS)
        : visible.slice(0, PROJECTION_OPEN_ITEMS).map(({ id, text }) => ({ id, text }));
      const res: OpenResults = { type: "open", respondents, total: visible.length, filtered: forControl ? num("filtered") : 0, items };
      return res;
    }
    case "wordcloud": {
      const [raw, hidden] = await Promise.all([redis.hgetall(K.txt(sid, slide.id)), redis.smembers(K.hidden(sid, slide.id))]);
      const hiddenSet = new Set(hidden);
      let words: WordItem[] = Object.entries(raw).map(([word, c]) => ({ word, count: Number(c), hidden: hiddenSet.has(word) }));
      if (!forControl) words = words.filter((w) => !w.hidden).map(({ word, count }) => ({ word, count }));
      words.sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
      return { type: "wordcloud", respondents, filtered: forControl ? num("filtered") : 0, words: words.slice(0, WORDS_MAX) };
    }
    case "grid": {
      const points: Record<string, { x: number; y: number; count: number }> = {};
      for (const it of slide.items) {
        const c = num(`c:${it.id}`);
        points[it.id] = { count: c, x: c ? num(`x:${it.id}`) / c : 0, y: c ? num(`y:${it.id}`) / c : 0 };
      }
      return { type: "grid", respondents, points };
    }
    case "ranking": {
      const avgRank: Record<string, number> = {};
      for (const o of slide.options) avgRank[o.id] = respondents ? num(`r:${o.id}`) / respondents : 0;
      return { type: "ranking", respondents, avgRank };
    }
    case "points": {
      const avg: Record<string, number> = {};
      for (const o of slide.options) avg[o.id] = respondents ? num(`p:${o.id}`) / respondents : 0;
      return { type: "points", respondents, avg };
    }
    case "quiz": {
      // Finché le risposte sono aperte la Proiezione vede solo quante risposte sono arrivate.
      const show = forControl || revealed;
      const counts: Record<string, number> = {};
      if (show) for (const o of slide.options) counts[o.id] = num(`o:${o.id}`);
      return { type: "quiz", respondents, revealed, correct: show ? num("correct") : 0, counts };
    }
    case "qa": {
      const items = await qaItems(redis, sid, slide.id, forControl);
      return { type: "qa", respondents: items.length, filtered: forControl ? num("filtered") : 0, items };
    }
  }
}

// ---------------------------------------------------------------- Q&A

const QA_ITEMS_MAX = 200;

/** Domande ordinate per voti; nascoste solo per la Regia. Nessun autore è mai registrato. */
export async function qaItems(redis: Redis, sid: string, slideId: string, forControl: boolean): Promise<QaItem[]> {
  const [raw, votes] = await Promise.all([redis.hgetall(K.qa(sid, slideId)), redis.hgetall(K.qaVotes(sid, slideId))]);
  const items: QaItem[] = Object.entries(raw).map(([id, v]) => {
    const q = JSON.parse(v) as { t: string; a?: 1; h?: 1 };
    return { id, text: q.t, votes: Number(votes[id] ?? 0), answered: q.a === 1, hidden: q.h === 1 };
  });
  const visible = forControl ? items : items.filter((i) => !i.hidden).map(({ hidden: _h, ...rest }) => rest);
  return visible
    .sort((a, b) => Number(a.answered) - Number(b.answered) || b.votes - a.votes || Number(a.id) - Number(b.id))
    .slice(0, QA_ITEMS_MAX);
}

export type QaAskResult = { ok: true; asked: number; filtered: boolean } | { ok: false; error: "limit_reached" };

/** Nuova domanda. Le filtrate non vengono salvate (solo conteggio). */
export async function qaAsk(
  redis: Redis,
  opts: { sid: string; slideId: string; tokenHash: string; text: string; isFiltered: (t: string) => boolean; expiresAt: number; max: number },
): Promise<QaAskResult> {
  const { sid, slideId, tokenHash, text, expiresAt } = opts;
  const subKey = K.sub(sid, slideId);
  const aggKey = K.agg(sid, slideId);
  const asked = await redis.hincrby(subKey, tokenHash, 1);
  if (asked > opts.max) {
    await redis.hincrby(subKey, tokenHash, -1);
    return { ok: false, error: "limit_reached" };
  }
  const m = redis.multi().pexpireat(subKey, expiresAt);
  const filtered = opts.isFiltered(text);
  if (filtered) m.hincrby(aggKey, "filtered", 1);
  else {
    const id = await redis.hincrby(aggKey, "seq", 1);
    m.hset(K.qa(sid, slideId), String(id), JSON.stringify({ t: text })).pexpireat(K.qa(sid, slideId), expiresAt);
  }
  await m.pexpireat(aggKey, expiresAt).exec();
  return { ok: true, asked, filtered };
}

export type QaVoteResult = { ok: true; votes: number } | { ok: false; error: "not_found" | "already_answered" };

/** Upvote: un voto per token per domanda (SADD atomico). */
export async function qaVote(
  redis: Redis,
  opts: { sid: string; slideId: string; tokenHash: string; qid: string; expiresAt: number },
): Promise<QaVoteResult> {
  const { sid, slideId, tokenHash, qid, expiresAt } = opts;
  const raw = await redis.hget(K.qa(sid, slideId), qid);
  if (!raw || (JSON.parse(raw) as { h?: 1 }).h === 1) return { ok: false, error: "not_found" };
  const votersKey = K.qaVoters(sid, slideId, qid);
  const [[, added]] = (await redis.multi().sadd(votersKey, tokenHash).pexpireat(votersKey, expiresAt).exec()) as [[null, number], unknown];
  if (!added) return { ok: false, error: "already_answered" };
  const [[, votes]] = (await redis
    .multi()
    .hincrby(K.qaVotes(sid, slideId), qid, 1)
    .pexpireat(K.qaVotes(sid, slideId), expiresAt)
    .exec()) as [[null, number], unknown];
  return { ok: true, votes };
}

/** Domande votate da questo token (per ripristinare lo stato dopo una riconnessione). */
export async function qaVotedBy(redis: Redis, sid: string, slideId: string, tokenHash: string): Promise<string[]> {
  const ids = await redis.hkeys(K.qa(sid, slideId));
  if (!ids.length) return [];
  const m = redis.multi();
  for (const id of ids) m.sismember(K.qaVoters(sid, slideId, id), tokenHash);
  const res = (await m.exec()) as [null, number][];
  return ids.filter((_, i) => res[i]?.[1] === 1);
}

/** Il facilitatore segna una domanda come risposta, o la nasconde/mostra. */
export async function qaUpdate(
  redis: Redis,
  opts: { sid: string; slideId: string; qid: string; answered?: boolean; hidden?: boolean; expiresAt: number },
): Promise<boolean> {
  const key = K.qa(opts.sid, opts.slideId);
  const raw = await redis.hget(key, opts.qid);
  if (!raw) return false;
  const q = JSON.parse(raw) as { t: string; a?: 1; h?: 1 };
  if (opts.answered !== undefined) opts.answered ? (q.a = 1) : delete q.a;
  if (opts.hidden !== undefined) opts.hidden ? (q.h = 1) : delete q.h;
  await redis.multi().hset(key, opts.qid, JSON.stringify(q)).pexpireat(key, opts.expiresAt).exec();
  return true;
}

// ---------------------------------------------------------------- Quiz

/** Esito personale del quiz (visibile al partecipante solo a risposte chiuse). */
export async function quizResultOf(redis: Redis, sid: string, slideId: string, tokenHash: string) {
  const [raw, total] = await Promise.all([redis.hget(K.quiz(sid, slideId), tokenHash), redis.zscore(K.score(sid), tokenHash)]);
  const r = raw ? (JSON.parse(raw) as { c: 0 | 1; p: number }) : null;
  return { answered: !!r, correct: r?.c === 1, points: r?.p ?? 0, total: Number(total ?? 0) };
}

/** Nasconde o mostra una risposta aperta o una voce della word cloud dalla Proiezione. */
export async function setHidden(
  redis: Redis,
  opts: { sid: string; slide: InteractiveSlide; itemId: string; hidden: boolean; expiresAt: number },
): Promise<boolean> {
  const { sid, slide, itemId, hidden, expiresAt } = opts;
  if (slide.type === "open") {
    const key = K.txt(sid, slide.id);
    const raw = await redis.hget(key, itemId);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { t: string; h?: 1 };
    if (hidden) parsed.h = 1;
    else delete parsed.h;
    await redis.multi().hset(key, itemId, JSON.stringify(parsed)).pexpireat(key, expiresAt).exec();
    return true;
  }
  if (slide.type === "wordcloud") {
    const key = K.hidden(sid, slide.id);
    if (hidden) await redis.multi().sadd(key, itemId).pexpireat(key, expiresAt).exec();
    else await redis.srem(key, itemId);
    return true;
  }
  return false;
}
