/**
 * Squadre e missione collettiva (Fase 3). Funzioni pure, usate dal servizio realtime.
 */
import type { MissionState, TeamInfo, TeamScore } from "../protocol";
import type { ActivitySettings } from "../slides/schema";

export const teamId = (index: number) => `t${index + 1}`;

export function teamsOf(settings: Pick<ActivitySettings, "teams">): TeamInfo[] {
  if (!settings.teams?.enabled) return [];
  return settings.teams.names.map((name, index) => ({ id: teamId(index), name, index }));
}

/**
 * Assegnazione bilanciata: la squadra con meno membri; a parità, la prima a partire da
 * un indice casuale (così le squadre si riempiono in modo uniforme e non prevedibile).
 */
export function pickBalancedTeam(teamIds: string[], counts: Record<string, number>, offset: number): string {
  let best = teamIds[0]!;
  let min = Infinity;
  for (let i = 0; i < teamIds.length; i++) {
    const id = teamIds[(i + offset) % teamIds.length]!;
    const c = counts[id] ?? 0;
    if (c < min) {
      min = c;
      best = id;
    }
  }
  return best;
}

/**
 * Punteggio di squadra = media dei punti dei membri, arrotondata: resta equo anche quando
 * le squadre (scelte liberamente) hanno dimensioni diverse. Pari punteggio = pari posizione.
 */
export function rankTeams(teams: TeamInfo[], members: Record<string, number>, totals: Record<string, number>): TeamScore[] {
  const scored = teams.map((t) => {
    const m = members[t.id] ?? 0;
    const total = totals[t.id] ?? 0;
    return { ...t, members: m, total, score: m > 0 ? Math.round(total / m) : 0, rank: 0 };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  scored.forEach((t, i) => (t.rank = i > 0 && t.score === scored[i - 1]!.score ? scored[i - 1]!.rank : i + 1));
  return scored;
}

/** Valore della missione: percentuale di risposte corrette (0–100, intera) o numero di risposte. */
export function missionState(
  settings: Pick<ActivitySettings, "mission">,
  data: { answers: number; correct: number; quizAnswers: number; done: boolean },
): MissionState | null {
  const m = settings.mission;
  if (!m?.enabled) return null;
  const value = m.type === "answers" ? data.answers : data.quizAnswers > 0 ? Math.round((data.correct / data.quizAnswers) * 100) : 0;
  const reached = m.type === "answers" ? value >= m.target : data.quizAnswers > 0 && value >= m.target;
  return { type: m.type, target: m.target, label: m.label, value, completed: data.done || reached };
}
