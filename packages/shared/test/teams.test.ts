import { describe, expect, it } from "vitest";
import { missionState, pickBalancedTeam, rankTeams, teamsOf } from "../src/scoring/teams";
import { DEFAULT_SETTINGS } from "../src/slides/schema";

const settings = (over: Partial<typeof DEFAULT_SETTINGS> = {}) => ({ ...DEFAULT_SETTINGS, ...over });

describe("squadre", () => {
  it("nessuna squadra se la modalità è spenta; id stabili t1..tN", () => {
    expect(teamsOf(settings())).toEqual([]);
    const t = teamsOf(settings({ teams: { enabled: true, mode: "auto", names: ["Rossi", "Blu", "Verdi"] } }));
    expect(t.map((x) => x.id)).toEqual(["t1", "t2", "t3"]);
    expect(t[2]!.name).toBe("Verdi");
  });

  it("bilanciamento: sceglie sempre una squadra con meno membri", () => {
    const ids = ["t1", "t2", "t3", "t4"];
    const counts: Record<string, number> = {};
    for (let i = 0; i < 103; i++) {
      const t = pickBalancedTeam(ids, counts, Math.floor(Math.random() * 4));
      const min = Math.min(...ids.map((id) => counts[id] ?? 0));
      expect(counts[t] ?? 0).toBe(min);
      counts[t] = (counts[t] ?? 0) + 1;
      const values = ids.map((id) => counts[id] ?? 0);
      expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
    }
    expect(ids.map((id) => counts[id])).toEqual(expect.arrayContaining([26, 26, 26, 25]));
  });

  it("a parità di membri l'indice casuale decide la squadra", () => {
    expect(pickBalancedTeam(["t1", "t2", "t3"], {}, 0)).toBe("t1");
    expect(pickBalancedTeam(["t1", "t2", "t3"], {}, 2)).toBe("t3");
    expect(pickBalancedTeam(["t1", "t2", "t3"], { t1: 1, t3: 1 }, 2)).toBe("t2");
  });

  it("punteggio di squadra = media dei punti dei membri; posizioni con parità", () => {
    const teams = teamsOf(settings({ teams: { enabled: true, mode: "choice", names: ["A", "B", "C", "D"] } }));
    const ranked = rankTeams(teams, { t1: 4, t2: 2, t3: 3, t4: 0 }, { t1: 3000, t2: 1500, t3: 2250, t4: 0 });
    // A = 750, B = 750, C = 750 → pari; D = 0 (nessun membro)
    expect(ranked.map((t) => [t.name, t.score, t.rank])).toEqual([
      ["A", 750, 1],
      ["B", 750, 1],
      ["C", 750, 1],
      ["D", 0, 4],
    ]);
    const r2 = rankTeams(teams, { t1: 2, t2: 2, t3: 1, t4: 1 }, { t1: 1000, t2: 1900, t3: 999, t4: 1001 });
    expect(r2.map((t) => t.name)).toEqual(["D", "C", "B", "A"]);
    expect(r2[0]).toMatchObject({ score: 1001, total: 1001, members: 1, rank: 1 });
    expect(r2[2]).toMatchObject({ name: "B", score: 950 });
  });

  it("la squadra più numerosa non vince solo perché ha più membri", () => {
    const teams = teamsOf(settings({ teams: { enabled: true, mode: "choice", names: ["Grande", "Piccola"] } }));
    const r = rankTeams(teams, { t1: 10, t2: 2 }, { t1: 5000, t2: 1800 });
    expect(r[0]!.name).toBe("Piccola"); // 900 di media contro 500
  });
});

describe("missione collettiva", () => {
  const correct80 = settings({ mission: { enabled: true, type: "correct", target: 80 } });
  const answers50 = settings({ mission: { enabled: true, type: "answers", target: 50 } });

  it("disattivata di default", () => {
    expect(missionState(settings(), { answers: 10, correct: 5, quizAnswers: 5, done: false })).toBeNull();
  });
  it("percentuale di risposte corrette", () => {
    expect(missionState(correct80, { answers: 0, correct: 0, quizAnswers: 0, done: false })).toMatchObject({ value: 0, completed: false });
    expect(missionState(correct80, { answers: 0, correct: 7, quizAnswers: 10, done: false })).toMatchObject({ value: 70, completed: false });
    expect(missionState(correct80, { answers: 0, correct: 8, quizAnswers: 10, done: false })).toMatchObject({ value: 80, completed: true });
    expect(missionState(correct80, { answers: 0, correct: 2, quizAnswers: 3, done: false })).toMatchObject({ value: 67, completed: false });
  });
  it("numero di risposte", () => {
    expect(missionState(answers50, { answers: 49, correct: 0, quizAnswers: 0, done: false })).toMatchObject({ value: 49, completed: false });
    expect(missionState(answers50, { answers: 50, correct: 0, quizAnswers: 0, done: false })).toMatchObject({ value: 50, completed: true });
  });
  it("una missione completata resta completata anche se la percentuale scende", () => {
    expect(missionState(correct80, { answers: 0, correct: 5, quizAnswers: 10, done: true })).toMatchObject({ value: 50, completed: true });
  });
});
