/**
 * Filtro parole inadatte.
 *
 * Normalizzazione richiesta: minuscole, rimozione accenti, sostituzioni comuni
 * (4→a, 3→e, 0→o, 1→i, @→a, $→s) e rimozione di spazi e punteggiatura interni.
 *
 * Ogni termine ha una modalità:
 * - `contains`: il termine normalizzato è cercato nel testo compattato (senza spazi né
 *   punteggiatura), così "c a z z o" o "c.a.z.z.o" vengono intercettati;
 * - `word`: il termine deve coincidere con una parola intera normalizzata. Serve per i
 *   termini corti che, compattati, darebbero falsi positivi (es. "ass" dentro "classe").
 */

export type MatchMode = "word" | "contains";
export type ModerationTerm = { term: string; match: MatchMode };

const SUBSTITUTIONS: Record<string, string> = {
  "4": "a",
  "3": "e",
  "0": "o",
  "1": "i",
  "@": "a",
  $: "s",
};

/** Minuscole, senza accenti, con le sostituzioni comuni. Spazi e punteggiatura restano. */
export function normalizeChars(input: string): string {
  const lower = input.toLowerCase().normalize("NFD").replace(/\p{M}+/gu, "");
  let out = "";
  for (const ch of lower) out += SUBSTITUTIONS[ch] ?? ch;
  return out;
}

/** Testo normalizzato senza spazi né punteggiatura (solo lettere e cifre residue). */
export function compact(input: string): string {
  return normalizeChars(input).replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Parole normalizzate, separate da spazi o punteggiatura. */
export function words(input: string): string[] {
  return normalizeChars(input)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** Modalità di default per un nuovo termine: `contains` dai 5 caratteri in su. */
export const defaultMatchMode = (term: string): MatchMode => (compact(term).length >= 5 ? "contains" : "word");

export type ModerationFilter = (text: string) => boolean;

/** Restituisce una funzione che indica se il testo va filtrato. */
export function createFilter(terms: ModerationTerm[]): ModerationFilter {
  const contains: string[] = [];
  const whole = new Set<string>();
  for (const t of terms) {
    const c = compact(t.term);
    if (!c) continue;
    if (t.match === "contains") contains.push(c);
    else whole.add(c);
  }
  return (text: string) => {
    if (!text) return false;
    const c = compact(text);
    for (const term of contains) if (c.includes(term)) return true;
    if (whole.size > 0) {
      const ws = words(text);
      for (const w of ws) if (whole.has(w)) return true;
      // Termine a parola intera scritto con spazi o punteggiatura tra le lettere
      // ("m.e.r.d.a", "f u c k"): si ricompongono le sequenze di parole di una lettera.
      let run = "";
      for (const w of ws) {
        if (w.length === 1) run += w;
        else {
          if (run.length > 1 && whole.has(run)) return true;
          run = "";
        }
      }
      if (run.length > 1 && whole.has(run)) return true;
      if (whole.has(c)) return true;
    }
    return false;
  };
}
