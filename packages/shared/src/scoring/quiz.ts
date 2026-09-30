/**
 * Punteggio del quiz (Fase 2): legato a correttezza e velocità.
 * - errata: 0 punti;
 * - corretta con timer: 500 + 500 × (tempo residuo / durata totale), arrotondato;
 * - corretta con timer disattivato dal facilitatore: 1000 punti fissi.
 * La durata totale tiene conto di moltiplicatori ed estensioni del timer.
 */
import type { QuizSlide } from "../slides/schema";
import type { QuizAnswer } from "../slides/answers";

export const QUIZ_MAX_POINTS = 1000;
export const QUIZ_BASE_POINTS = 500;

export type QuizTiming = { start: number; end: number } | null;

export function quizPoints(correct: boolean, timing: QuizTiming, answeredAt: number): number {
  if (!correct) return 0;
  if (!timing) return QUIZ_MAX_POINTS;
  const total = timing.end - timing.start;
  if (total <= 0) return QUIZ_BASE_POINTS;
  const remaining = Math.min(Math.max(timing.end - answeredAt, 0), total);
  return Math.round(QUIZ_BASE_POINTS + (QUIZ_MAX_POINTS - QUIZ_BASE_POINTS) * (remaining / total));
}

/** Confronto tollerante delle risposte scritte: maiuscole, accenti, punteggiatura e spazi ignorati. */
export function normalizeQuizText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function isQuizCorrect(slide: Pick<QuizSlide, "mode" | "correctOptionId" | "acceptedAnswers">, answer: QuizAnswer): boolean {
  if (slide.mode === "single") return "optionId" in answer && answer.optionId === slide.correctOptionId;
  if (!("text" in answer)) return false;
  const given = normalizeQuizText(answer.text);
  return given.length > 0 && slide.acceptedAnswers.some((a) => normalizeQuizText(a) === given);
}
