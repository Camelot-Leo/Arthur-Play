import { z } from "zod";
import { LIMITS } from "../limits";

const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const text = (max: number) => z.string().trim().max(max);
const notes = text(LIMITS.notesMax).optional();

export const contentSlideSchema = z.object({
  id,
  type: z.literal("content"),
  title: text(LIMITS.titleMax).min(1),
  body: text(LIMITS.bodyMax).optional(),
  image: z
    .object({
      id: z.string().uuid(),
      alt: text(LIMITS.imageAltMax).min(1),
    })
    .optional(),
  notes,
});

const optionSchema = z.object({ id, label: text(LIMITS.optionLabelMax).min(1) });

export const choiceSlideSchema = z.object({
  id,
  type: z.literal("choice"),
  question: text(LIMITS.questionMax).min(1),
  options: z.array(optionSchema).min(LIMITS.choiceOptionsMin).max(LIMITS.choiceOptionsMax),
  multiple: z.boolean().default(false),
  notes,
});

export const scaleSlideSchema = z.object({
  id,
  type: z.literal("scale"),
  question: text(LIMITS.questionMax).min(1),
  statements: z.array(optionSchema).min(1).max(LIMITS.scaleStatementsMax),
  max: z.union([z.literal(5), z.literal(10)]),
  minLabel: text(40).optional(),
  maxLabel: text(40).optional(),
  notes,
});

export const openSlideSchema = z.object({
  id,
  type: z.literal("open"),
  question: text(LIMITS.questionMax).min(1),
  maxAnswers: z.number().int().min(1).max(LIMITS.openAnswersPerPersonMax).default(1),
  notes,
});

export const wordcloudSlideSchema = z.object({
  id,
  type: z.literal("wordcloud"),
  question: text(LIMITS.questionMax).min(1),
  maxEntries: z.number().int().min(1).max(LIMITS.wordsPerPersonMax).default(3),
  notes,
});

const axisSchema = z.object({ min: text(40).min(1), max: text(40).min(1) });

/** Griglia 2x2: due assi, i partecipanti posizionano ogni elemento; risultato = punti medi. */
export const gridSlideSchema = z.object({
  id,
  type: z.literal("grid"),
  question: text(LIMITS.questionMax).min(1),
  xAxis: axisSchema,
  yAxis: axisSchema,
  items: z.array(optionSchema).min(1).max(LIMITS.gridItemsMax),
  notes,
});

/** Ranking: ordinamento delle opzioni; risultato = posizione media. */
export const rankingSlideSchema = z.object({
  id,
  type: z.literal("ranking"),
  question: text(LIMITS.questionMax).min(1),
  options: z.array(optionSchema).min(2).max(LIMITS.choiceOptionsMax),
  notes,
});

/** 100 punti: distribuzione di 100 punti tra le opzioni; risultato = media per opzione. */
export const pointsSlideSchema = z.object({
  id,
  type: z.literal("points"),
  question: text(LIMITS.questionMax).min(1),
  options: z.array(optionSchema).min(2).max(LIMITS.choiceOptionsMax),
  notes,
});

/** Q&A anonimo con upvote e moderazione del facilitatore. */
export const qaSlideSchema = z.object({
  id,
  type: z.literal("qa"),
  question: text(LIMITS.questionMax).min(1),
  notes,
});

/**
 * Quiz a punti: risposta singola (opzioni + risposta corretta) o scritta (risposte accettate).
 * `timerSeconds` null = senza timer (punteggio fisso).
 */
export const quizSlideSchema = z.object({
  id,
  type: z.literal("quiz"),
  question: text(LIMITS.questionMax).min(1),
  mode: z.enum(["single", "text"]),
  options: z.array(optionSchema).max(LIMITS.choiceOptionsMax).default([]),
  correctOptionId: id.optional(),
  acceptedAnswers: z.array(text(LIMITS.quizAnswerMax).min(1)).max(LIMITS.quizAcceptedMax).default([]),
  timerSeconds: z.number().int().min(LIMITS.timerMinSeconds).max(LIMITS.quizTimerMaxSeconds).nullable().default(20),
  /** Spiegazione mostrata dopo ogni risposta nella modalità a ritmo libero. */
  explanation: text(LIMITS.explanationMax).optional(),
  notes,
});

export const slideSchema = z.discriminatedUnion("type", [
  contentSlideSchema,
  choiceSlideSchema,
  scaleSlideSchema,
  openSlideSchema,
  wordcloudSlideSchema,
  gridSlideSchema,
  rankingSlideSchema,
  pointsSlideSchema,
  qaSlideSchema,
  quizSlideSchema,
]);

/**
 * Modalità Squadre: N squadre, assegnazione automatica bilanciata o scelta dal partecipante.
 * Con le squadre attive la classifica è solo tra squadre.
 */
export const teamsSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  mode: z.enum(["auto", "choice"]).default("auto"),
  names: z.array(text(LIMITS.teamNameMax).min(1)).min(LIMITS.teamsMin).max(LIMITS.teamsMax).default(["Squadra Rossa", "Squadra Blu"]),
});

/**
 * Missione collettiva: obiettivo comune della classe.
 * - `correct`: percentuale di risposte corrette ai quiz (aggiornata solo a risposte chiuse);
 * - `answers`: numero totale di risposte inviate.
 */
export const missionSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  type: z.enum(["correct", "answers"]).default("correct"),
  target: z.number().int().min(1).max(LIMITS.missionTargetMax).default(80),
  label: text(LIMITS.titleMax).optional(),
});

export const DEFAULT_SETTINGS = {
  leaderboard: false,
  moderation: true,
  teams: { enabled: false, mode: "auto" as "auto" | "choice", names: ["Squadra Rossa", "Squadra Blu"] },
  mission: { enabled: false, type: "correct" as "correct" | "answers", target: 80 } as { enabled: boolean; type: "correct" | "answers"; target: number; label?: string },
};

export const activitySettingsSchema = z
  .object({
    /** Classifica individuale: disattivata di default; ignorata se le squadre sono attive. */
    leaderboard: z.boolean().default(false),
    /** Filtro parole inadatte: attivo di default. */
    moderation: z.boolean().default(true),
    teams: teamsSettingsSchema.default(DEFAULT_SETTINGS.teams),
    mission: missionSettingsSchema.default(DEFAULT_SETTINGS.mission),
  })
  .superRefine((s, ctx) => {
    if (s.mission.type === "correct" && s.mission.target > 100) {
      ctx.addIssue({ code: "custom", path: ["mission", "target"], message: "percentuale" });
    }
  });

/** Impostazioni complete (con default) anche per attività salvate prima della Fase 3. */
export function normalizeSettings(raw: unknown): ActivitySettings {
  const p = activitySettingsSchema.safeParse(raw ?? {});
  return p.success ? p.data : activitySettingsSchema.parse({});
}

export const activityContentSchema = z.object({
  title: text(LIMITS.titleMax).min(1),
  description: text(LIMITS.bodyMax).optional(),
  slides: z.array(slideSchema).min(1).max(LIMITS.slidesMax),
  settings: activitySettingsSchema.default(DEFAULT_SETTINGS),
}).superRefine((a, ctx) => {
  a.slides.forEach((s, i) => {
    if (s.type !== "quiz") return;
    const path = ["slides", i];
    if (s.mode === "single") {
      if (s.options.length < LIMITS.choiceOptionsMin) ctx.addIssue({ code: "custom", path: [...path, "options"], message: "opzioni" });
      if (!s.options.some((o) => o.id === s.correctOptionId)) ctx.addIssue({ code: "custom", path: [...path, "correctOptionId"], message: "corretta" });
    } else if (s.acceptedAnswers.length === 0) {
      ctx.addIssue({ code: "custom", path: [...path, "acceptedAnswers"], message: "risposte accettate" });
    }
  });
});

export type ContentSlide = z.infer<typeof contentSlideSchema>;
export type ChoiceSlide = z.infer<typeof choiceSlideSchema>;
export type ScaleSlide = z.infer<typeof scaleSlideSchema>;
export type OpenSlide = z.infer<typeof openSlideSchema>;
export type WordcloudSlide = z.infer<typeof wordcloudSlideSchema>;
export type GridSlide = z.infer<typeof gridSlideSchema>;
export type RankingSlide = z.infer<typeof rankingSlideSchema>;
export type PointsSlide = z.infer<typeof pointsSlideSchema>;
export type QaSlide = z.infer<typeof qaSlideSchema>;
export type QuizSlide = z.infer<typeof quizSlideSchema>;
export type Slide = z.infer<typeof slideSchema>;
export type SlideType = Slide["type"];
export type InteractiveSlide = Exclude<Slide, ContentSlide>;
export type ActivitySettings = z.infer<typeof activitySettingsSchema>;
export type ActivityContent = z.infer<typeof activityContentSchema>;

export const isInteractive = (s: Slide): s is InteractiveSlide => s.type !== "content";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Versione della slide inviata ai partecipanti: senza note del facilitatore. */
export type PublicSlide = DistributiveOmit<Slide, "notes">;
export type PublicInteractive = DistributiveOmit<InteractiveSlide, "notes">;

/**
 * Versione pubblica: senza note e, per i quiz, senza la soluzione
 * (la soluzione arriva ai partecipanti solo a risposte chiuse, vedi `SessionState.reveal`).
 */
export function toPublicSlide(slide: Slide): PublicSlide {
  const { notes: _notes, ...rest } = slide;
  if (rest.type === "quiz") {
    const { correctOptionId: _c, acceptedAnswers: _a, explanation: _e, ...quiz } = rest;
    return { ...quiz, acceptedAnswers: [] } as PublicSlide;
  }
  return rest as PublicSlide;
}
