/**
 * Raggruppamento in temi delle risposte aperte e della word cloud (Fase 5).
 *
 * All'AI si inviano SOLO: la domanda (scritta dal facilitatore) e i testi delle risposte
 * visibili in Proiezione. Mai nickname, token, codici o identificativi di sessione;
 * mai risposte filtrate (non vengono nemmeno salvate) né nascoste dal facilitatore.
 */
import type { Redis } from "ioredis";
import { z } from "zod";
import { createFilter, type ModerationTerm, type Theme } from "@arthur/shared";
import { K } from "@arthur/shared/server";
import { MAX_THEMES, MIN_THEME_RESPONSES } from "./config";
import type { AiTransport } from "./transport";
import { AiInvalidOutputError } from "./transport";

export type ThemeInput = { text: string; weight: number };

/** Testi visibili della slide (risposta aperta o word cloud), letti da Redis. */
export async function collectThemeInputs(redis: Redis, sid: string, slide: { id: string; type: string }): Promise<ThemeInput[]> {
  const raw = await redis.hgetall(K.txt(sid, slide.id));
  if (slide.type === "open") {
    return Object.values(raw)
      .map((v) => JSON.parse(v) as { t: string; h?: 1 })
      .filter((v) => v.h !== 1)
      .map((v) => ({ text: v.t, weight: 1 }));
  }
  if (slide.type === "wordcloud") {
    const hidden = new Set(await redis.smembers(K.hidden(sid, slide.id)));
    return Object.entries(raw)
      .filter(([w]) => !hidden.has(w))
      .map(([w, c]) => ({ text: w, weight: Number(c) }));
  }
  return [];
}

export const countResponses = (inputs: ThemeInput[]) => inputs.reduce((a, i) => a + i.weight, 0);

export const ThemesSchema = z.object({
  themes: z.array(
    z.object({
      label: z.string().describe("Nome breve del tema, massimo 40 caratteri"),
      items: z.array(z.number().int()).describe("Numeri delle risposte che appartengono al tema"),
    }),
  ),
});

export const SYSTEM_THEMES = `Raggruppi in temi le risposte anonime di una classe durante un'attività di formazione su soft skills. Scrivi in italiano.
Individua da 2 a ${MAX_THEMES} temi chiari e distinti; ogni tema ha un nome breve (massimo 40 caratteri) e l'elenco dei numeri delle risposte che gli appartengono. Ogni risposta va in un solo tema. Nomi neutri e rispettosi: non citare né giudicare singole risposte.`;

/** Unico contenuto inviato all'AI: domanda e testi numerati. */
export function buildThemesUser(question: string, inputs: ThemeInput[]): string {
  const lines = inputs.map((i, n) => `${n + 1}. ${i.text}${i.weight > 1 ? ` (×${i.weight})` : ""}`);
  return `Domanda: ${question}\n\nRisposte:\n${lines.join("\n")}`;
}

export class TooFewResponsesError extends Error {
  constructor() {
    super("too_few");
    this.name = "TooFewResponsesError";
  }
}

export async function groupThemes(
  transport: AiTransport,
  model: string,
  opts: { question: string; inputs: ThemeInput[]; moderation: ModerationTerm[] },
): Promise<Theme[]> {
  if (countResponses(opts.inputs) < MIN_THEME_RESPONSES) throw new TooFewResponsesError();
  const out = await transport.structured(
    { model, system: SYSTEM_THEMES, user: buildThemesUser(opts.question, opts.inputs), effort: "medium", maxTokens: 8000 },
    ThemesSchema,
  );
  // Il filtro di moderazione vale anche per ciò che l'AI restituisce.
  const filtered = createFilter(opts.moderation);
  const used = new Set<number>();
  const themes: Theme[] = [];
  for (const t of out.themes.slice(0, MAX_THEMES)) {
    const label = t.label.trim().slice(0, 40);
    if (!label || filtered(label)) continue;
    const members = [...new Set(t.items)]
      .map((n) => n - 1)
      .filter((i) => i >= 0 && i < opts.inputs.length && !used.has(i));
    if (!members.length) continue;
    members.forEach((i) => used.add(i));
    const items = members.map((i) => opts.inputs[i]!).sort((a, b) => b.weight - a.weight);
    themes.push({ label, count: items.reduce((a, i) => a + i.weight, 0), examples: items.slice(0, 3).map((i) => i.text) });
  }
  if (!themes.length) throw new AiInvalidOutputError();
  return themes.sort((a, b) => b.count - a.count);
}

/** I temi vivono in Redis con la scadenza della sessione, come ogni altro dato della sessione. */
export async function saveThemes(redis: Redis, sid: string, slideId: string, themes: Theme[], expiresAt: number) {
  await redis.set(K.themes(sid, slideId), JSON.stringify(themes), "PXAT", expiresAt);
}
