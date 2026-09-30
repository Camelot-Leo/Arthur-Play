import { describe, expect, it } from "vitest";
import { validateAnswer } from "../src/slides/answers";
import { activityContentSchema, type InteractiveSlide } from "../src/slides/schema";

const choice: InteractiveSlide = {
  id: "c1",
  type: "choice",
  question: "Q",
  multiple: false,
  options: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ],
};
const scale: InteractiveSlide = { id: "s1", type: "scale", question: "Q", max: 5, statements: [{ id: "x", label: "X" }] };
const open: InteractiveSlide = { id: "o1", type: "open", question: "Q", maxAnswers: 2 };
const cloud: InteractiveSlide = { id: "w1", type: "wordcloud", question: "Q", maxEntries: 3 };

describe("validazione lato server delle risposte", () => {
  it("scelta multipla", () => {
    expect(validateAnswer(choice, { optionIds: ["a"] }).ok).toBe(true);
    expect(validateAnswer(choice, { optionIds: ["a", "b"] }).ok).toBe(false);
    expect(validateAnswer(choice, { optionIds: ["z"] }).ok).toBe(false);
    expect(validateAnswer({ ...choice, multiple: true }, { optionIds: ["a", "b"] }).ok).toBe(true);
    expect(validateAnswer(choice, "a").ok).toBe(false);
  });
  it("scala", () => {
    expect(validateAnswer(scale, { values: { x: 3 } }).ok).toBe(true);
    expect(validateAnswer(scale, { values: { x: 6 } }).ok).toBe(false);
    expect(validateAnswer(scale, { values: { x: 0 } }).ok).toBe(false);
    expect(validateAnswer(scale, { values: { y: 3 } }).ok).toBe(false);
    expect(validateAnswer(scale, { values: { x: 2.5 } }).ok).toBe(false);
  });
  it("risposta aperta: massimo 200 caratteri", () => {
    expect(validateAnswer(open, { text: "ciao" }).ok).toBe(true);
    expect(validateAnswer(open, { text: "a".repeat(200) }).ok).toBe(true);
    expect(validateAnswer(open, { text: "a".repeat(201) }).ok).toBe(false);
    expect(validateAnswer(open, { text: "   " }).ok).toBe(false);
  });
  it("word cloud: massimo 25 caratteri per voce e numero di voci configurato", () => {
    expect(validateAnswer(cloud, { words: ["fiducia", "ascolto"] }).ok).toBe(true);
    expect(validateAnswer(cloud, { words: ["a".repeat(26)] }).ok).toBe(false);
    expect(validateAnswer(cloud, { words: ["a", "b", "c", "d"] }).ok).toBe(false);
  });
});

describe("schema attività", () => {
  it("accetta un'attività valida e applica i default", () => {
    const parsed = activityContentSchema.parse({ title: "T", slides: [{ id: "c", type: "content", title: "Ciao" }] });
    expect(parsed.settings).toEqual({ leaderboard: false, moderation: true });
  });
  it("rifiuta immagini senza testo alternativo", () => {
    const r = activityContentSchema.safeParse({
      title: "T",
      slides: [{ id: "c", type: "content", title: "Ciao", image: { id: "7d7e5b9c-0a3b-4a3e-9d1c-3f1f4b8a2c11", alt: "" } }],
    });
    expect(r.success).toBe(false);
  });
});

describe("validazione dei tipi della Fase 2", () => {
  const grid: InteractiveSlide = {
    id: "g",
    type: "grid",
    question: "Q",
    xAxis: { min: "Basso", max: "Alto" },
    yAxis: { min: "Poco", max: "Molto" },
    items: [
      { id: "i1", label: "Uno" },
      { id: "i2", label: "Due" },
    ],
  };
  const ranking: InteractiveSlide = {
    id: "r",
    type: "ranking",
    question: "Q",
    options: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
      { id: "c", label: "C" },
    ],
  };
  const points: InteractiveSlide = { ...ranking, id: "p", type: "points" } as InteractiveSlide;

  it("griglia 2x2: tutti gli elementi posizionati, coordinate 0–100", () => {
    expect(validateAnswer(grid, { positions: { i1: { x: 0, y: 100 }, i2: { x: 50, y: 50 } } }).ok).toBe(true);
    expect(validateAnswer(grid, { positions: { i1: { x: 0, y: 100 } } }).ok).toBe(false);
    expect(validateAnswer(grid, { positions: { i1: { x: 101, y: 0 }, i2: { x: 1, y: 1 } } }).ok).toBe(false);
    expect(validateAnswer(grid, { positions: { i1: { x: 1, y: 1 }, i2: { x: 1, y: 1 }, x: { x: 1, y: 1 } } }).ok).toBe(false);
  });
  it("ranking: permutazione completa delle opzioni", () => {
    expect(validateAnswer(ranking, { order: ["c", "a", "b"] }).ok).toBe(true);
    expect(validateAnswer(ranking, { order: ["a", "a", "b"] }).ok).toBe(false);
    expect(validateAnswer(ranking, { order: ["a", "b"] }).ok).toBe(false);
    expect(validateAnswer(ranking, { order: ["a", "b", "z"] }).ok).toBe(false);
  });
  it("100 punti: somma esattamente 100, valori interi non negativi", () => {
    expect(validateAnswer(points, { points: { a: 50, b: 30, c: 20 } }).ok).toBe(true);
    expect(validateAnswer(points, { points: { a: 100 } }).ok).toBe(true);
    expect(validateAnswer(points, { points: { a: 50, b: 30 } }).ok).toBe(false);
    expect(validateAnswer(points, { points: { a: 120, b: -20 } }).ok).toBe(false);
    expect(validateAnswer(points, { points: { a: 50.5, b: 49.5 } }).ok).toBe(false);
    expect(validateAnswer(points, { points: { a: 50, z: 50 } }).ok).toBe(false);
  });
});
