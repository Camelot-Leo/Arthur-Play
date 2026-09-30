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
} from "@arthur/shared";
import { wordKey } from "@arthur/shared";
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
  }
  m.pexpireat(aggKey, expiresAt);
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
export async function computeResults(redis: Redis, sid: string, slide: InteractiveSlide, forControl: boolean): Promise<SlideResults> {
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
  }
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
