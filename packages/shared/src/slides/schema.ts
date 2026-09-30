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

export const slideSchema = z.discriminatedUnion("type", [
  contentSlideSchema,
  choiceSlideSchema,
  scaleSlideSchema,
  openSlideSchema,
  wordcloudSlideSchema,
]);

export const activitySettingsSchema = z.object({
  /** Classifica individuale: disattivata di default (Fase 3). */
  leaderboard: z.boolean().default(false),
  /** Filtro parole inadatte: attivo di default. */
  moderation: z.boolean().default(true),
});

export const activityContentSchema = z.object({
  title: text(LIMITS.titleMax).min(1),
  description: text(LIMITS.bodyMax).optional(),
  slides: z.array(slideSchema).min(1).max(LIMITS.slidesMax),
  settings: activitySettingsSchema.default({ leaderboard: false, moderation: true }),
});

export type ContentSlide = z.infer<typeof contentSlideSchema>;
export type ChoiceSlide = z.infer<typeof choiceSlideSchema>;
export type ScaleSlide = z.infer<typeof scaleSlideSchema>;
export type OpenSlide = z.infer<typeof openSlideSchema>;
export type WordcloudSlide = z.infer<typeof wordcloudSlideSchema>;
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

export function toPublicSlide(slide: Slide): PublicSlide {
  const { notes: _notes, ...rest } = slide;
  return rest as PublicSlide;
}
