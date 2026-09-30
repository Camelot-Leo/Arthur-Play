import { z } from "zod";
import { LIMITS } from "../limits";
import type { InteractiveSlide } from "./schema";

/** Risposte inviate dai partecipanti, validate lato server rispetto alla slide. */
export type ChoiceAnswer = { optionIds: string[] };
export type ScaleAnswer = { values: Record<string, number> };
export type OpenAnswer = { text: string };
export type WordcloudAnswer = { words: string[] };
export type Answer = ChoiceAnswer | ScaleAnswer | OpenAnswer | WordcloudAnswer;

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
  }
}

/** Chiave di raggruppamento delle voci della word cloud (minuscole, spazi compattati). */
export const wordKey = (w: string) => cleanText(w).toLocaleLowerCase("it-IT");
