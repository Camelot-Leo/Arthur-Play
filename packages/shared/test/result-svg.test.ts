import { describe, expect, it } from "vitest";
import { resultSvg } from "../src/export/result-svg";
import type { PublicInteractive } from "../src/slides/schema";

describe("immagine del risultato (SVG per il PNG)", () => {
  it("contiene la domanda e i risultati, con i testi codificati", () => {
    const slide: PublicInteractive = {
      id: "c",
      type: "choice",
      question: "Qual è il <segreto> di una squadra?",
      multiple: false,
      options: [
        { id: "a", label: "Fiducia & ascolto" },
        { id: "b", label: "Obiettivi" },
      ],
    };
    const svg = resultSvg({ slide, data: { type: "choice", respondents: 4, counts: { a: 3, b: 1 } } });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("&lt;segreto&gt;");
    expect(svg).toContain("Fiducia &amp; ascolto");
    expect(svg).toContain("75% (3)");
    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/); // nessun riferimento esterno
  });
  it("funziona per tutti i tipi senza errori", () => {
    const cases: [PublicInteractive, any][] = [
      [{ id: "s", type: "scale", question: "Q", max: 5, statements: [{ id: "x", label: "X" }] }, { type: "scale", respondents: 1, stats: { x: { count: 1, avg: 3, dist: [0, 0, 1, 0, 0] } } }],
      [{ id: "o", type: "open", question: "Q", maxAnswers: 1 }, { type: "open", respondents: 1, total: 1, filtered: 0, items: [{ id: "1", text: "Ciao" }] }],
      [{ id: "w", type: "wordcloud", question: "Q", maxEntries: 1 }, { type: "wordcloud", respondents: 1, filtered: 0, words: [{ word: "fiducia", count: 2 }] }],
      [
        { id: "g", type: "grid", question: "Q", xAxis: { min: "a", max: "b" }, yAxis: { min: "c", max: "d" }, items: [{ id: "i", label: "I" }] },
        { type: "grid", respondents: 1, points: { i: { x: 10, y: 90, count: 1 } } },
      ],
      [{ id: "r", type: "ranking", question: "Q", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] }, { type: "ranking", respondents: 1, avgRank: { a: 1, b: 2 } }],
      [{ id: "p", type: "points", question: "Q", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] }, { type: "points", respondents: 1, avg: { a: 60, b: 40 } }],
      [{ id: "q", type: "qa", question: "Q" }, { type: "qa", respondents: 1, filtered: 0, items: [{ id: "1", text: "Domanda?", votes: 3, answered: false }] }],
      [
        { id: "z", type: "quiz", question: "Q", mode: "single", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], acceptedAnswers: [], timerSeconds: 20 },
        { type: "quiz", respondents: 2, revealed: true, correct: 1, counts: { a: 1, b: 1 } },
      ],
    ];
    for (const [slide, data] of cases) {
      const svg = resultSvg({ slide, data, solution: { correctOptionId: "a" } });
      expect(svg).toContain("</svg>");
      expect(svg).not.toContain("NaN");
      expect(svg).not.toContain("undefined");
    }
  });
  it("le voci nascoste dalla Regia non finiscono nell'immagine", () => {
    const svg = resultSvg({
      slide: { id: "o", type: "open", question: "Q", maxAnswers: 1 },
      data: { type: "open", respondents: 2, total: 1, filtered: 1, items: [{ id: "1", text: "Visibile" }, { id: "2", text: "Nascosta", hidden: true }] },
    });
    expect(svg).toContain("Visibile");
    expect(svg).not.toContain("Nascosta");
  });
});
