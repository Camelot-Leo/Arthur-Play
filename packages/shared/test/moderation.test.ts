import { describe, expect, it } from "vitest";
import { compact, createFilter, defaultMatchMode, normalizeChars } from "../src/moderation/filter";
import { SEED_TERMS } from "../src/moderation/seed";

const filter = createFilter(SEED_TERMS);

describe("normalizzazione", () => {
  it("minuscole, accenti, sostituzioni comuni", () => {
    expect(normalizeChars("CÀZZÒ")).toBe("cazzo");
    expect(normalizeChars("c4zz0")).toBe("cazzo");
    expect(normalizeChars("$tr0nz0")).toBe("stronzo");
    expect(normalizeChars("m3rd@")).toBe("merda");
    expect(normalizeChars("f1ga")).toBe("figa");
  });
  it("rimuove spazi e punteggiatura interni", () => {
    expect(compact("c a z z o")).toBe("cazzo");
    expect(compact("c.a-z_z!o")).toBe("cazzo");
    expect(compact("  M e R d A ")).toBe("merda");
  });
  it("modalità di default: parola intera sotto i 5 caratteri", () => {
    expect(defaultMatchMode("ass")).toBe("word");
    expect(defaultMatchMode("stronzo")).toBe("contains");
  });
});

describe("filtro: ogni voce delle liste e le sue varianti vengono filtrate", () => {
  for (const { term, match } of SEED_TERMS) {
    it(`${term} (${match})`, () => {
      expect(filter(term)).toBe(true);
      expect(filter(term.toUpperCase())).toBe(true);
      expect(filter(`sei proprio ${term}!`)).toBe(true);
      // Lettere separate da spazi e punti
      expect(filter(term.split("").join(" "))).toBe(true);
      expect(filter(term.split("").join("."))).toBe(true);
      // Sostituzioni leet
      const leet = term.replace(/a/g, "4").replace(/e/g, "3").replace(/o/g, "0").replace(/i/g, "1").replace(/s/g, "$");
      expect(filter(leet)).toBe(true);
      // Accenti
      const accented = term.replace(/a/g, "à").replace(/e/g, "è").replace(/o/g, "ò");
      expect(filter(accented)).toBe(true);
    });
  }
});

describe("filtro: casi espliciti", () => {
  const blocked = [
    "che cazzata",
    "INCAZZATO",
    "sei uno str0nz0",
    "Va FaNcUl0",
    "m.e.r.d.a",
    "c@zz0",
    "vaffa",
    "porco dio",
    "p0rc0 d10",
    "What the F U C K",
    "bullshit",
    "sh1t",
    "you are an a$$hole",
    "c o g l i o n e",
    "puttanate",
  ];
  const allowed = [
    "classe",
    "significa",
    "assemblea",
    "passione",
    "cocktail",
    "Dickens",
    "this hit the target",
    "scuola",
    "calcolo",
    "Lavoro di squadra",
    "Comunicazione efficace",
    "fiducia",
    "",
  ];
  for (const t of blocked) it(`filtra: ${JSON.stringify(t)}`, () => expect(filter(t)).toBe(true));
  for (const t of allowed) it(`non filtra: ${JSON.stringify(t)}`, () => expect(filter(t)).toBe(false));
});
