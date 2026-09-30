"use client";
/**
 * Suoni della Proiezione, sintetizzati con Web Audio: nessun file e nessuna richiesta esterna.
 * I browser richiedono un gesto dell'utente prima di riprodurre audio: `unlock()` va chiamato
 * dal pulsante "Attiva i suoni".
 */
type Note = { f: number; t: number; d: number; type?: OscillatorType; g?: number };

let ctx: AudioContext | null = null;

export function audioReady(): boolean {
  return !!ctx && ctx.state === "running";
}

export async function unlockAudio(): Promise<boolean> {
  try {
    ctx ??= new AudioContext();
    if (ctx.state !== "running") await ctx.resume();
    return ctx.state === "running";
  } catch {
    return false;
  }
}

function play(notes: Note[]) {
  if (!ctx || ctx.state !== "running") return;
  const now = ctx.currentTime;
  for (const n of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = n.type ?? "sine";
    osc.frequency.value = n.f;
    const peak = n.g ?? 0.18;
    gain.gain.setValueAtTime(0.0001, now + n.t);
    gain.gain.exponentialRampToValueAtTime(peak, now + n.t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + n.t);
    osc.stop(now + n.t + n.d + 0.05);
  }
}

export const sounds = {
  /** Nuova risposta arrivata (breve e discreto). */
  tick: () => play([{ f: 880, t: 0, d: 0.08, type: "triangle", g: 0.06 }]),
  /** Cambio slide. */
  whoosh: () => play([{ f: 440, t: 0, d: 0.12, type: "triangle", g: 0.08 }, { f: 660, t: 0.06, d: 0.14, type: "triangle", g: 0.08 }]),
  /** Tempo scaduto / risposte chiuse. */
  timeUp: () => play([{ f: 392, t: 0, d: 0.25, type: "square", g: 0.08 }, { f: 262, t: 0.22, d: 0.4, type: "square", g: 0.08 }]),
  /** Soluzione del quiz svelata. */
  reveal: () => play([{ f: 523, t: 0, d: 0.15 }, { f: 659, t: 0.12, d: 0.15 }, { f: 784, t: 0.24, d: 0.3 }]),
  /** Missione compiuta / podio. */
  fanfare: () =>
    play([
      { f: 523, t: 0, d: 0.18, type: "triangle" },
      { f: 659, t: 0.18, d: 0.18, type: "triangle" },
      { f: 784, t: 0.36, d: 0.18, type: "triangle" },
      { f: 1047, t: 0.54, d: 0.6, type: "triangle", g: 0.22 },
    ]),
};
