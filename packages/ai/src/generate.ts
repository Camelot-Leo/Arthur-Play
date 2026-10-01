/**
 * Generazione di un'attività da un argomento o da un documento (Fase 5).
 * All'AI va solo il materiale del facilitatore (argomento o testo del documento): nessun dato
 * di partecipanti o sessioni. Il risultato è una bozza, validata con gli stessi schemi
 * dell'editor e sempre modificabile prima dell'uso.
 */
import { z } from "zod";
import { DEFAULT_SETTINGS, LIMITS, activityContentSchema, type ActivityContent, type Slide } from "@arthur/shared";
import type { AiTransport } from "./transport";
import { AiInvalidOutputError } from "./transport";

/** Schema piatto dell'output (più robusto per gli output strutturati); convertito poi nelle slide reali. */
const GenSlideSchema = z.object({
  type: z.enum(["content", "choice", "scale", "open", "wordcloud", "grid", "ranking", "points", "qa", "quiz"]),
  title: z.string().describe("Titolo (slide di contenuto) oppure testo della domanda"),
  body: z.string().describe("Testo della slide di contenuto; stringa vuota negli altri casi"),
  options: z
    .array(z.string())
    .describe("Opzioni (choice, ranking, points, quiz a scelta singola), affermazioni (scale) o elementi (grid); vuoto negli altri casi"),
  multiple: z.boolean().describe("Solo choice: più risposte ammesse"),
  correct_option_index: z.number().int().describe("Solo quiz a scelta singola: indice (da 0) dell'opzione corretta; -1 negli altri casi"),
  quiz_mode: z.enum(["single", "text"]),
  accepted_answers: z.array(z.string()).describe("Solo quiz a risposta scritta: risposte accettate (max 5)"),
  explanation: z.string().describe("Solo quiz: breve spiegazione della risposta corretta"),
  scale_max: z.number().int().describe("Solo scale: 5 oppure 10"),
  min_label: z.string(),
  max_label: z.string(),
  x_min: z.string().describe("Solo grid: etichetta del minimo dell'asse orizzontale"),
  x_max: z.string(),
  y_min: z.string(),
  y_max: z.string(),
  notes: z.string().describe("Note per il facilitatore (come condurre la slide)"),
});

export const GenActivitySchema = z.object({
  title: z.string(),
  description: z.string(),
  slides: z.array(GenSlideSchema),
});
export type GenActivity = z.infer<typeof GenActivitySchema>;
type GenSlide = z.infer<typeof GenSlideSchema>;

export type GenerateInput = {
  topic?: string;
  documentText?: string;
  audience: "studenti" | "docenti";
  slideCount: number;
};

export const SYSTEM_GENERATE = `Sei un progettista didattico di Arthur Italia. Prepari attività interattive per sessioni di formazione su soft skills e competenze trasversali (comunicazione, lavoro di squadra, problem solving, gestione del tempo, orientamento) rivolte a studenti di scuole secondarie, ITS, CFP e università, oppure a docenti.

Scrivi sempre in italiano chiaro, adatto al pubblico indicato. Molti studenti sono minorenni: niente contenuti inadatti, niente domande su dati personali, salute, famiglia o opinioni politiche e religiose.

Un'attività è una sequenza di slide. Tipi disponibili:
- content: titolo e breve testo esplicativo (massimo 600 caratteri)
- choice: sondaggio a scelta multipla, 2–6 opzioni
- scale: 1–4 affermazioni da valutare su scala 1–5 o 1–10
- open: risposta aperta breve
- wordcloud: una o poche parole
- grid: griglia 2x2 con due assi e 2–6 elementi da posizionare
- ranking: 3–6 opzioni da ordinare
- points: distribuzione di 100 punti tra 2–5 opzioni
- qa: spazio per domande anonime della classe
- quiz: verifica con una sola risposta corretta (quiz_mode "single", 2–4 opzioni) o risposta scritta breve (quiz_mode "text", 1–5 risposte accettate); aggiungi sempre una spiegazione

Alterna contenuti e interazioni, parti con una domanda che coinvolge, chiudi con una riflessione. Domande e opzioni brevi (massimo 120 caratteri per le domande, 60 per le opzioni). Compila tutti i campi: quelli non pertinenti al tipo di slide restano vuoti, -1 o 5.`;

export function buildGenerateUser(input: GenerateInput): string {
  const audience = input.audience === "docenti" ? "docenti" : "studenti";
  const source = input.documentText
    ? `Basati sul seguente documento fornito dal facilitatore:\n<documento>\n${input.documentText}\n</documento>`
    : `Argomento indicato dal facilitatore: ${input.topic}`;
  return `${source}\n\nDestinatari: ${audience}.\nPrepara un'attività di circa ${input.slideCount} slide.`;
}

const cut = (s: string, max: number) => s.trim().slice(0, max).trim();
const newId = (i: number) => `ai${i + 1}${Math.random().toString(36).slice(2, 7)}`;

/** Conversione di una slide generata nello schema reale; null se non utilizzabile. */
export function toSlide(g: GenSlide, i: number): Slide | null {
  const id = newId(i);
  const question = cut(g.title, LIMITS.questionMax);
  const notes = cut(g.notes, LIMITS.notesMax) || undefined;
  const opts = (max: number) =>
    g.options
      .map((o) => cut(o, LIMITS.optionLabelMax))
      .filter(Boolean)
      .slice(0, max)
      .map((label, j) => ({ id: `o${j + 1}`, label }));
  if (!question) return null;
  switch (g.type) {
    case "content":
      return { id, type: "content", title: cut(g.title, LIMITS.titleMax), body: cut(g.body, LIMITS.bodyMax) || undefined, notes };
    case "choice":
      return { id, type: "choice", question, options: opts(LIMITS.choiceOptionsMax), multiple: g.multiple, notes };
    case "scale":
      return {
        id,
        type: "scale",
        question,
        statements: opts(LIMITS.scaleStatementsMax),
        max: g.scale_max === 10 ? 10 : 5,
        minLabel: cut(g.min_label, 40) || undefined,
        maxLabel: cut(g.max_label, 40) || undefined,
        notes,
      };
    case "open":
      return { id, type: "open", question, maxAnswers: 1, notes };
    case "wordcloud":
      return { id, type: "wordcloud", question, maxEntries: 3, notes };
    case "grid":
      return {
        id,
        type: "grid",
        question,
        xAxis: { min: cut(g.x_min, 40), max: cut(g.x_max, 40) },
        yAxis: { min: cut(g.y_min, 40), max: cut(g.y_max, 40) },
        items: opts(LIMITS.gridItemsMax),
        notes,
      };
    case "ranking":
    case "points":
      return { id, type: g.type, question, options: opts(LIMITS.choiceOptionsMax), notes };
    case "qa":
      return { id, type: "qa", question, notes };
    case "quiz": {
      const explanation = cut(g.explanation, LIMITS.explanationMax) || undefined;
      if (g.quiz_mode === "text") {
        const accepted = g.accepted_answers.map((a) => cut(a, LIMITS.quizAnswerMax)).filter(Boolean).slice(0, LIMITS.quizAcceptedMax);
        return { id, type: "quiz", question, mode: "text", options: [], acceptedAnswers: accepted, timerSeconds: 30, explanation, notes };
      }
      const options = opts(LIMITS.choiceOptionsMax);
      const correct = options[g.correct_option_index];
      return { id, type: "quiz", question, mode: "single", options, correctOptionId: correct?.id, acceptedAnswers: [], timerSeconds: 20, explanation, notes };
    }
  }
}

/** Bozza validata: le slide non valide vengono scartate, il resto passa dallo schema dell'editor. */
export function toActivity(gen: GenActivity, input: Pick<GenerateInput, "slideCount">): ActivityContent {
  const slides = gen.slides
    .slice(0, Math.min(LIMITS.slidesMax, Math.max(input.slideCount * 2, 10)))
    .map(toSlide)
    .filter((s): s is Slide => s !== null)
    .filter((s) => activityContentSchema.safeParse({ title: "x", slides: [s] }).success);
  if (slides.length === 0) throw new AiInvalidOutputError();
  return activityContentSchema.parse({
    title: cut(gen.title, LIMITS.titleMax) || "Attività generata",
    description: cut(gen.description, LIMITS.bodyMax) || undefined,
    slides,
    settings: DEFAULT_SETTINGS,
  });
}

export async function generateActivity(transport: AiTransport, model: string, input: GenerateInput): Promise<ActivityContent> {
  const gen = await transport.structured(
    { model, system: SYSTEM_GENERATE, user: buildGenerateUser(input), effort: "high", maxTokens: 16000 },
    GenActivitySchema,
  );
  return toActivity(gen, input);
}
