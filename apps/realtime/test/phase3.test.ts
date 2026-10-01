import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, EV, type ActivityContent, type ActivitySettings, type SessionState } from "@arthur/shared";
import { K, createSession, sessionKeys, signTicket } from "@arthur/shared/server";
import { SECRET, emit, nextEvent, socket, startServer, waitConnect } from "./helpers";

let srv: Awaited<ReturnType<typeof startServer>>;

const quiz = (id: string) => ({
  id,
  type: "quiz" as const,
  question: `Domanda ${id}`,
  mode: "single" as const,
  options: [
    { id: "a", label: "Giusta" },
    { id: "b", label: "Sbagliata" },
  ],
  correctOptionId: "a",
  acceptedAnswers: [],
  timerSeconds: null,
});

const make = (settings: Partial<ActivitySettings>): ActivityContent => ({
  title: "Fase 3",
  settings: { ...DEFAULT_SETTINGS, ...settings },
  slides: [{ id: "intro", type: "content", title: "Via" }, quiz("q1"), quiz("q2"), { id: "o1", type: "open", question: "Aperta", maxAnswers: 1 }],
});

beforeAll(async () => {
  if (!process.env.REDIS_URL?.endsWith("/15")) throw new Error("I test devono usare il database Redis 15");
  srv = await startServer();
});
afterAll(async () => {
  await srv.stop();
});

async function setup(activity: ActivityContent) {
  const sess = await createSession(srv.redis, { ownerId: "o", activity });
  const ctrl = srv.track(socket(srv.url, { role: "control", ticket: await signTicket(SECRET, { sid: sess.sid, uid: "o", role: "control" }) }));
  const proj = srv.track(socket(srv.url, { role: "projection", ticket: await signTicket(SECRET, { sid: sess.sid, uid: "o", role: "projection" }) }));
  await Promise.all([waitConnect(ctrl), waitConnect(proj)]);
  const [init] = await Promise.all([emit(ctrl, EV.init), emit(proj, EV.init)]);
  const join = async (nickname: string) => {
    const s = srv.track(socket(srv.url, { role: "participant", code: sess.code }));
    await waitConnect(s);
    const res = await emit(s, EV.join, { nickname });
    return { s, res };
  };
  return { sess, ctrl, proj, init, join };
}

describe("squadre", () => {
  it("assegnazione automatica bilanciata anche con 60 ingressi simultanei", async () => {
    const { sess, join, init } = await setup(make({ teams: { enabled: true, mode: "auto", names: ["Rossi", "Blu", "Verdi", "Gialli"] } }));
    expect(init.state.teams.list.map((t: any) => t.id)).toEqual(["t1", "t2", "t3", "t4"]);
    const joined = await Promise.all(Array.from({ length: 60 }, (_, i) => join(`Persona ${i + 100}`)));
    const byTeam: Record<string, number> = {};
    for (const j of joined) {
      expect(j.res.team).toMatch(/^t[1-4]$/);
      byTeam[j.res.team] = (byTeam[j.res.team] ?? 0) + 1;
    }
    expect(Object.values(byTeam)).toEqual([15, 15, 15, 15]);
    expect(await srv.redis.hgetall(K.teams(sess.sid))).toEqual({ t1: "15", t2: "15", t3: "15", t4: "15" });
    // La squadra resta la stessa dopo una riconnessione
    const again = srv.track(socket(srv.url, { role: "participant", code: sess.code }));
    await waitConnect(again);
    expect(await emit(again, EV.resume, { token: joined[0]!.res.token })).toMatchObject({ ok: true, team: joined[0]!.res.team });
    // Con l'assegnazione automatica non si può scegliere
    expect(await emit(joined[0]!.s, EV.chooseTeam, { teamId: "t1" })).toEqual({ ok: false, error: "invalid" });
  });

  it("scelta del partecipante: una sola volta, squadre valide", async () => {
    const { join } = await setup(make({ teams: { enabled: true, mode: "choice", names: ["Rossi", "Blu"] } }));
    const a = await join("Scelta Uno");
    expect(a.res.team).toBeNull();
    expect(await emit(a.s, EV.chooseTeam, { teamId: "t9" })).toEqual({ ok: false, error: "invalid" });
    expect(await emit(a.s, EV.chooseTeam, { teamId: "t2" })).toEqual({ ok: true, team: "t2" });
    expect(await emit(a.s, EV.chooseTeam, { teamId: "t1" })).toEqual({ ok: true, team: "t2" }); // non si cambia squadra
  });

  it("punteggio di squadra = media dei punti; classifica solo tra squadre; posizione personale", async () => {
    const { sess, ctrl, proj, join } = await setup(make({ leaderboard: true, teams: { enabled: true, mode: "choice", names: ["Rossi", "Blu"] } }));
    const r1 = await join("Rosso Uno");
    const r2 = await join("Rosso Due");
    const b1 = await join("Blu Uno");
    await emit(r1.s, EV.chooseTeam, { teamId: "t1" });
    await emit(r2.s, EV.chooseTeam, { teamId: "t1" });
    await emit(b1.s, EV.chooseTeam, { teamId: "t2" });
    await emit(ctrl, EV.goto, { index: 1 }); // quiz senza timer: 1000 punti per risposta corretta
    await emit(r1.s, EV.answer, { slideId: "q1", answer: { optionId: "a" } });
    await emit(r2.s, EV.answer, { slideId: "q1", answer: { optionId: "b" } });
    await emit(b1.s, EV.answer, { slideId: "q1", answer: { optionId: "a" } });

    const board = await nextEvent<any>(ctrl, EV.board, (b) => b.teams?.some((t: any) => t.total > 0) && b.teams.reduce((a: number, t: any) => a + t.total, 0) === 2000);
    expect(board.top).toBeNull(); // con le squadre niente classifica individuale
    expect(board.teams.map((t: any) => [t.name, t.members, t.total, t.score, t.rank])).toEqual([
      ["Blu", 1, 1000, 1000, 1],
      ["Rossi", 2, 1000, 500, 2],
    ]);
    expect(await srv.redis.zscore(K.teamScore(sess.sid), "t1")).toBe("1000");

    // La Proiezione riceve la classifica solo quando il facilitatore la mostra
    let early = false;
    proj.on(EV.board, () => (early = true));
    await new Promise((r) => setTimeout(r, 300));
    expect(early).toBe(false);
    const shown = nextEvent<any>(proj, EV.board);
    expect(await emit(ctrl, EV.view, { view: "podium" })).toEqual({ ok: true });
    expect((await shown).teams[0].name).toBe("Blu");

    expect(await emit(r2.s, EV.standing)).toMatchObject({ ok: true, team: { id: "t1", name: "Rossi" }, teamRank: 2, teamScore: 500, score: 0, rank: null });
    // Cambiando slide la Proiezione torna alla slide
    const st = nextEvent<SessionState>(proj, EV.state, (s) => s.index === 2);
    await emit(ctrl, EV.goto, { index: 2 });
    expect((await st).view).toBe("slide");
  });
});

describe("classifica individuale", () => {
  it("disattivata di default: nessuna classifica e nessuna vista classifica", async () => {
    const { ctrl, init } = await setup(make({}));
    expect(init.state.leaderboard).toBe(false);
    expect(await emit(ctrl, EV.view, { view: "leaderboard" })).toEqual({ ok: false, error: "invalid" });
    expect(await emit(ctrl, EV.view, { view: "podium" })).toEqual({ ok: false, error: "invalid" });
  });

  it("attivata per l'attività: prime posizioni con nickname e posizione personale", async () => {
    const { ctrl, proj, join, init } = await setup(make({ leaderboard: true }));
    expect(init.state.leaderboard).toBe(true);
    const a = await join("Primo Posto");
    const b = await join("Secondo Posto");
    await emit(ctrl, EV.goto, { index: 1 });
    await emit(a.s, EV.answer, { slideId: "q1", answer: { optionId: "a" } });
    await emit(b.s, EV.answer, { slideId: "q1", answer: { optionId: "b" } });
    const shown = nextEvent<any>(proj, EV.board, (x) => x.top?.length === 2);
    await emit(ctrl, EV.view, { view: "leaderboard" });
    const board = await shown;
    expect(board.top).toEqual([
      { nickname: "Primo Posto", score: 1000, rank: 1 },
      { nickname: "Secondo Posto", score: 0, rank: 2 },
    ]);
    expect(await emit(b.s, EV.standing)).toMatchObject({ ok: true, score: 0, rank: 2, team: null });
  });
});

describe("missione collettiva", () => {
  it("80% di risposte corrette: aggiornata solo a risposte chiuse, completamento definitivo", async () => {
    const { ctrl, join, init } = await setup(make({ mission: { enabled: true, type: "correct", target: 80 } }));
    expect(init.state.mission).toMatchObject({ type: "correct", target: 80, value: 0, completed: false });
    const ps = await Promise.all(["Uno", "Due", "Tre", "Quattro", "Cinque"].map((n) => join(`Missione ${n}`)));

    await emit(ctrl, EV.goto, { index: 1 });
    // 4 corrette su 5
    for (const [i, p] of ps.entries()) await emit(p.s, EV.answer, { slideId: "q1", answer: { optionId: i === 4 ? "b" : "a" } });
    // A quiz aperto la barra non si muove (non deve rivelare nulla)
    const early = await nextEvent<any>(ps[0]!.s, EV.mission);
    expect(early).toEqual({ value: 0, completed: false });

    const done = nextEvent<any>(ps[0]!.s, EV.mission, (m) => m.completed);
    await emit(ctrl, EV.lock, { locked: true });
    expect(await done).toEqual({ value: 80, completed: true });

    // Quiz successivo tutto sbagliato: la percentuale scende ma la missione resta completata
    await emit(ctrl, EV.goto, { index: 2 });
    for (const p of ps) await emit(p.s, EV.answer, { slideId: "q2", answer: { optionId: "b" } });
    const after = nextEvent<any>(ps[0]!.s, EV.mission, (m) => m.value === 40);
    await emit(ctrl, EV.lock, { locked: true });
    expect(await after).toEqual({ value: 40, completed: true });
  });

  it("numero di risposte: completata al raggiungimento dell'obiettivo", async () => {
    const { sess, ctrl, proj, join } = await setup(make({ mission: { enabled: true, type: "answers", target: 3 } }));
    const ps = await Promise.all(["A", "B", "C"].map((n) => join(`Risposte ${n}`)));
    await emit(ctrl, EV.goto, { index: 3 });
    await emit(ps[0]!.s, EV.answer, { slideId: "o1", answer: { text: "uno" } });
    await nextEvent<any>(proj, EV.mission, (m) => m.value === 1 && !m.completed);
    await emit(ps[1]!.s, EV.answer, { slideId: "o1", answer: { text: "due" } });
    await emit(ps[2]!.s, EV.answer, { slideId: "o1", answer: { text: "tre" } });
    expect(await nextEvent<any>(proj, EV.mission, (m) => m.completed)).toEqual({ value: 3, completed: true });

    // Chiusura: nessuna chiave residua (squadre, punteggi, missione comprese)
    await emit(ctrl, EV.close);
    await new Promise((r) => setTimeout(r, 200));
    expect(await sessionKeys(srv.redis, sess.sid)).toEqual([]);
  });
});

describe("suoni della Proiezione", () => {
  it("attivi di default e disattivabili dalla Regia", async () => {
    const { ctrl, proj, init } = await setup(make({}));
    expect(init.state.sounds).toBe(true);
    const off = nextEvent<SessionState>(proj, EV.state, (s) => s.sounds === false);
    await emit(ctrl, EV.sounds, { enabled: false });
    await off;
  });
});
