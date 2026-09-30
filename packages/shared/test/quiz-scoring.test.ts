import { describe, expect, it } from "vitest";
import { isQuizCorrect, normalizeQuizText, quizPoints } from "../src/scoring/quiz";
import { activityContentSchema, toPublicSlide, type QuizSlide } from "../src/slides/schema";
import { validateAnswer } from "../src/slides/answers";

const t0 = 1_000_000;
const timing = { start: t0, end: t0 + 20_000 }; // 20 secondi

describe("punteggio del quiz: correttezza", () => {
  it("risposta errata = 0 punti, qualunque sia la velocità", () => {
    expect(quizPoints(false, timing, t0)).toBe(0);
    expect(quizPoints(false, timing, t0 + 19_000)).toBe(0);
    expect(quizPoints(false, null, t0)).toBe(0);
  });
  it("risposta corretta senza timer = 1000 punti fissi", () => {
    expect(quizPoints(true, null, t0)).toBe(1000);
    expect(quizPoints(true, null, t0 + 999_999)).toBe(1000);
  });
});

describe("punteggio del quiz: velocità", () => {
  it("risposta istantanea = 1000, allo scadere = 500", () => {
    expect(quizPoints(true, timing, t0)).toBe(1000);
    expect(quizPoints(true, timing, t0 + 20_000)).toBe(500);
  });
  it("proporzionale al tempo residuo", () => {
    expect(quizPoints(true, timing, t0 + 5_000)).toBe(875); // 15/20 residui
    expect(quizPoints(true, timing, t0 + 10_000)).toBe(750);
    expect(quizPoints(true, timing, t0 + 15_000)).toBe(625);
    expect(quizPoints(true, timing, t0 + 1_234)).toBe(Math.round(500 + 500 * (18_766 / 20_000)));
  });
  it("più veloce = mai meno punti (monotonia)", () => {
    let prev = Infinity;
    for (let ms = 0; ms <= 20_000; ms += 250) {
      const p = quizPoints(true, timing, t0 + ms);
      expect(p).toBeLessThanOrEqual(prev);
      expect(p).toBeGreaterThanOrEqual(500);
      expect(p).toBeLessThanOrEqual(1000);
      prev = p;
    }
  });
  it("tempo fuori intervallo viene limitato", () => {
    expect(quizPoints(true, timing, t0 - 5_000)).toBe(1000);
    expect(quizPoints(true, timing, t0 + 60_000)).toBe(500);
  });
  it("timer allungato (×2 o esteso): la stessa attesa vale di più", () => {
    const doubled = { start: t0, end: t0 + 40_000 };
    expect(quizPoints(true, doubled, t0 + 10_000)).toBe(875);
    expect(quizPoints(true, doubled, t0 + 10_000)).toBeGreaterThan(quizPoints(true, timing, t0 + 10_000));
  });
});

describe("correttezza delle risposte", () => {
  const single: QuizSlide = {
    id: "q",
    type: "quiz",
    question: "Capitale d'Italia?",
    mode: "single",
    options: [
      { id: "a", label: "Roma" },
      { id: "b", label: "Milano" },
    ],
    correctOptionId: "a",
    acceptedAnswers: [],
    timerSeconds: 20,
  };
  const text: QuizSlide = { ...single, mode: "text", options: [], correctOptionId: undefined, acceptedAnswers: ["Ascolto attivo", "empatia"] };

  it("risposta singola", () => {
    expect(isQuizCorrect(single, { optionId: "a" })).toBe(true);
    expect(isQuizCorrect(single, { optionId: "b" })).toBe(false);
    expect(isQuizCorrect(single, { text: "Roma" })).toBe(false);
  });
  it("risposta scritta: maiuscole, accenti, punteggiatura e spazi ignorati", () => {
    expect(normalizeQuizText("  Ascolto,   ATTIVO! ")).toBe("ascolto attivo");
    expect(isQuizCorrect(text, { text: "ascolto attivo" })).toBe(true);
    expect(isQuizCorrect(text, { text: "ASCOLTO-ATTIVO" })).toBe(true);
    expect(isQuizCorrect(text, { text: "Empatìa" })).toBe(true);
    expect(isQuizCorrect(text, { text: "ascolto" })).toBe(false);
    expect(isQuizCorrect(text, { text: "" })).toBe(false);
  });
  it("la soluzione non è mai nella versione pubblica della slide", () => {
    const pub = JSON.stringify(toPublicSlide(single));
    expect(pub).not.toContain("correctOptionId");
    expect(JSON.stringify(toPublicSlide(text))).not.toContain("empatia");
  });
  it("validazione: il quiz a risposta singola richiede una risposta corretta esistente", () => {
    const base = { title: "T", slides: [{ ...single, correctOptionId: "zzz" }] };
    expect(activityContentSchema.safeParse(base).success).toBe(false);
    expect(activityContentSchema.safeParse({ title: "T", slides: [single] }).success).toBe(true);
    expect(activityContentSchema.safeParse({ title: "T", slides: [{ ...text, acceptedAnswers: [] }] }).success).toBe(false);
  });
  it("validazione della risposta del partecipante", () => {
    expect(validateAnswer(single, { optionId: "a" }).ok).toBe(true);
    expect(validateAnswer(single, { optionId: "x" }).ok).toBe(false);
    expect(validateAnswer(text, { text: "qualcosa" }).ok).toBe(true);
    expect(validateAnswer(text, { text: "x".repeat(81) }).ok).toBe(false);
  });
});
