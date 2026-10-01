/**
 * Generatore di nickname casuali, per evitare che i partecipanti usino il proprio nome.
 * Liste locali: nessuna richiesta esterna.
 */
const ANIMALI = [
  "Volpe", "Lince", "Gufo", "Delfino", "Koala", "Panda", "Tigre", "Aquila", "Lontra", "Riccio",
  "Falco", "Lupo", "Orso", "Pinguino", "Zebra", "Giraffa", "Camaleonte", "Castoro", "Cervo", "Colibrì",
  "Fenicottero", "Gatto", "Ghepardo", "Leone", "Lemure", "Merlo", "Polpo", "Scoiattolo", "Tasso", "Tucano",
];
// Aggettivi invariabili nel genere, così si accordano con qualunque animale.
const QUALITA = [
  "Veloce", "Gentile", "Audace", "Brillante", "Tenace", "Vivace", "Solare", "Paziente", "Felice", "Agile",
  "Originale", "Cordiale", "Forte", "Sagace", "Capace", "Abile", "Loquace", "Fedele", "Nobile", "Docile",
];

const pick = <T>(arr: readonly T[], rnd: () => number): T => arr[Math.floor(rnd() * arr.length)]!;

export function randomNickname(rnd: () => number = Math.random): string {
  const n = Math.floor(rnd() * 90) + 10;
  return `${pick(ANIMALI, rnd)} ${pick(QUALITA, rnd)} ${n}`;
}
