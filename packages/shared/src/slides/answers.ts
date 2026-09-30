import { z } from "zod";
import { LIMITS } from "../limits";
import type { InteractiveSlide } from "./schema";

/** Risposte inviate dai partecipanti, validate lato server rispetto alla slide. */
export type ChoiceAnswer = { optionIds: string[] };
export type ScaleAnswer = { values: Record<string, number> };
export type OpenAnswer = { text: string };
export type WordcloudAnswer = { words: string[] };
export type GridAnswer = { positions: Record<string, { x: number; y: number }> };
export type RankingAnswer = { order: string[] };
export type PointsAnswer = { points: Record<string, number> };
export type QuizAnswer = { optionId: string } | { text: string };
export type Answer = ChoiceAnswer | ScaleAnswer | OpenAnswer | WordcloudAnswer | GridAnswer | RankingAnswer | PointsAnswer | QuizAnswer;

const cleanText = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

export type AnswerResult<T> = { ok: true; value: T } | { ok: false };

export function validateAnswer(slide: InteractiveSlide, raw: unknown): AnswerResult<Answer> {
  switch (slide.type) {
    case "choice": {
      const p = z.object({ optionIds: z.array(z.string()).min(1).max(slide.options.length) }).safeParse(raw);
      if (!p.success) return { ok: false };
      const ids = [...new Set(p.data.optionIds)];
      if (!slide.multiple && ids.length !== 1) return { ok: false };
      const valid = new Set(slide.options.map((o) => o.id));
      if (!ids.every((i) => valid.has(i))) return { ok: false };
      return { ok: true, value: { optionIds: ids } };
    }
    case "scale": {
      const p = z.object({ values: z.record(z.string(), z.number().int()) }).safeParse(raw);
      if (!p.success) return { ok: false };
      const valid = new Set(slide.statements.map((s) => s.id));
      const entries = Object.entries(p.data.values);
      if (entries.length === 0) return { ok: false };
      for (const [k, v] of entries) {
        if (!valid.has(k) || v < 1 || v > slide.max) return { ok: false };
      }
      return { ok: true, value: { values: Object.fromEntries(entries) } };
    }
    case "open": {
      const p = z.object({ text: z.string().max(LIMITS.openAnswerMax * 2) }).safeParse(raw);
      if (!p.success) return { ok: false };
      const text = cleanText(p.data.text);
      if (text.length < 1 || text.length > LIMITS.openAnswerMax) return { ok: false };
      return { ok: true, value: { text } };
    }
    case "wordcloud": {
      const p = z.object({ words: z.array(z.string().max(LIMITS.wordMax * 2)).min(1).max(slide.maxEntries) }).safeParse(raw);
      if (!p.success) return { ok: false };
      const words = p.data.words.map(cleanText).filter((w) => w.length > 0);
      if (words.length === 0 || words.some((w) => w.length > LIMITS.wordMax)) return { ok: false };
      return { ok: true, value: { words } };
    }
    case "grid": {
      const coord = z.number().int().min(0).max(LIMITS.gridMax);
      const p = z.object({ positions: z.record(z.string(), z.object({ x: coord, y: coord })) }).safeParse(raw);
      if (!p.success) return { ok: false };
      const ids = slide.items.map((i) => i.id);
      const keys = Object.keys(p.data.positions);
      if (keys.length !== ids.length || !ids.every((i) => p.data.positions[i])) return { ok: false };
      const positions = Object.fromEntries(ids.map((i) => [i, { x: p.data.positions[i]!.x, y: p.data.positions[i]!.y }]));
      return { ok: true, value: { positions } };
    }
    case "ranking": {
      const p = z.object({ order: z.array(z.string()).length(slide.options.length) }).safeParse(raw);
      if (!p.success) return { ok: false };
      const ids = new Set(slide.options.map((o) => o.id));
      if (new Set(p.data.order).size !== ids.size || !p.data.order.every((i) => ids.has(i))) return { ok: false };
      return { ok: true, value: { order: p.data.order } };
    }
    case "points": {
      const p = z.object({ points: z.record(z.string(), z.number().int().min(0).max(LIMITS.pointsTotal)) }).safeParse(raw);
      if (!p.success) return { ok: false };
      const ids = new Set(slide.options.map((o) => o.id));
      const entries = Object.entries(p.data.points).filter(([, v]) => v > 0);
      if (!entries.every(([k]) => ids.has(k))) return { ok: false };
      if (entries.reduce((a, [, v]) => a + v, 0) !== LIMITS.pointsTotal) return { ok: false };
      return { ok: true, value: { points: Object.fromEntries(entries) } };
    }
    case "quiz": {
      if (slide.mode === "single") {
        const p = z.object({ optionId: z.string() }).safeParse(raw);
        if (!p.success || !slide.options.some((o) => o.id === p.data.optionId)) return { ok: false };
        return { ok: true, value: { optionId: p.data.optionId } };
      }
      const p = z.object({ text: z.string().max(LIMITS.quizAnswerMax * 2) }).safeParse(raw);
      if (!p.success) return { ok: false };
      const text = cleanText(p.data.text);
      if (text.length < 1 || text.length > LIMITS.quizAnswerMax) return { ok: false };
      return { ok: true, value: { text } };
    }
    case "qa":
      // Le domande e i voti del Q&A hanno eventi dedicati (vedi validateQaQuestion).
      return { ok: false };
  }
}

/** Testo di una domanda del Q&A. */
export function validateQaQuestion(raw: unknown): AnswerResult<string> {
  const p = z.object({ text: z.string().max(LIMITS.qaQuestionMax * 2) }).safeParse(raw);
  if (!p.success) return { ok: false };
  const text = cleanText(p.data.text);
  if (text.length < 1 || text.length > LIMITS.qaQuestionMax) return { ok: false };
  return { ok: true, value: text };
}

/** Chiave di raggruppamento delle voci della word cloud (minuscole, spazi compattati). */
export const wordKey = (w: string) => cleanText(w).toLocaleLowerCase("it-IT");
