import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EV, type ActivityContent, type SessionState } from "@arthur/shared";
import { K, createSession, sessionKeys, signTicket } from "@arthur/shared/server";
import { SECRET, emit, nextEvent, socket, startServer, waitConnect } from "./helpers";

let srv: Awaited<ReturnType<typeof startServer>>;

const activity: ActivityContent = {
  title: "Fase 2",
  settings: { leaderboard: false, moderation: true },
  slides: [
    { id: "intro", type: "content", title: "Via" },
    {
      id: "quiz1",
      type: "quiz",
      question: "Qual è la capitale d'Italia?",
      mode: "single",
      options: [
        { id: "a", label: "Roma" },
        { id: "b", label: "Milano" },
      ],
      correctOptionId: "a",
      acceptedAnswers: [],
      timerSeconds: 20,
    },
    { id: "quiz2", type: "quiz", question: "Come si chiama l'ascolto...?", mode: "text", options: [], acceptedAnswers: ["attivo"], timerSeconds: 10 },
    { id: "qa1", type: "qa", question: "Domande?" },
    {
      id: "grid1",
      type: "grid",
      question: "Posiziona",
      xAxis: { min: "Facile", max: "Difficile" },
      yAxis: { min: "Poco utile", max: "Molto utile" },
      items: [
        { id: "i1", label: "Ascolto" },
        { id: "i2", label: "Feedback" },
      ],
    },
    {
      id: "rank1",
      type: "ranking",
      question: "Ordina",
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
        { id: "c", label: "C" },
      ],
    },
    {
      id: "pts1",
      type: "points",
      question: "Distribuisci 100 punti",
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
    },
  ],
};

beforeAll(async () => {
  if (!process.env.REDIS_URL?.endsWith("/15")) throw new Error("I test devono usare il database Redis 15");
  srv = await startServer();
});
afterAll(async () => {
  await srv.stop();
});

async function setup(n = 2) {
  const sess = await createSession(srv.redis, { ownerId: "o", activity });
  const ctrl = srv.track(socket(srv.url, { role: "control", ticket: await signTicket(SECRET, { sid: sess.sid, uid: "o", role: "control" }) }));
  const proj = srv.track(socket(srv.url, { role: "projection", ticket: await signTicket(SECRET, { sid: sess.sid, uid: "o", role: "projection" }) }));
  await Promise.all([waitConnect(ctrl), waitConnect(proj)]);
  const [init] = await Promise.all([emit(ctrl, EV.init), emit(proj, EV.init)]);
  const ps = [];
  for (let i = 0; i < n; i++) {
    const s = srv.track(socket(srv.url, { role: "participant", code: sess.code }));
    await waitConnect(s);
    const res = await emit(s, EV.join, { nickname: `Persona ${i + 10}` });
    ps.push({ s, token: res.token as string });
  }
  return { sess, ctrl, proj, ps, init };
}

describe("quiz a punti (live)", () => {
  it("timer automatico, soluzione nascosta, punteggio per velocità, esito personale a risposte chiuse", async () => {
    const { sess, ctrl, proj, ps, init } = await setup(2);
    expect(init.activity.slides[1].correctOptionId).toBe("a"); // la Regia vede la soluzione

    const st = nextEvent<SessionState>(ps[0]!.s, EV.state, (x) => x.index === 1);
    await emit(ctrl, EV.goto, { index: 1 });
    const state = await st;
    expect(state.timerEnd! - state.now).toBeGreaterThan(19_000);
    expect(state.timerEnd! - state.now).toBeLessThanOrEqual(20_000);
    expect(JSON.stringify(state)).not.toContain("correctOptionId");
    expect(state.reveal).toBeNull();

    expect(await emit(ps[0]!.s, EV.answer, { slideId: "quiz1", answer: { optionId: "a" } })).toMatchObject({ ok: true });
    await new Promise((r) => setTimeout(r, 1200));
    expect(await emit(ps[1]!.s, EV.answer, { slideId: "quiz1", answer: { optionId: "b" } })).toMatchObject({ ok: true });
    expect(await emit(ps[0]!.s, EV.answer, { slideId: "quiz1", answer: { optionId: "b" } })).toEqual({ ok: false, error: "already_answered" });

    // A risposte aperte: la Proiezione vede solo il numero, non la distribuzione né le corrette
    const open = await nextEvent<any>(proj, EV.results, (r) => r?.data?.respondents === 2);
    expect(open.data).toMatchObject({ revealed: false, correct: 0, counts: {} });
    // e il partecipante non può conoscere l'esito prima della chiusura
    expect(await emit(ps[0]!.s, EV.myResult, { slideId: "quiz1" })).toEqual({ ok: false, error: "locked" });

    const revealed = nextEvent<SessionState>(ps[0]!.s, EV.state, (x) => x.locked);
    await emit(ctrl, EV.lock, { locked: true });
    expect((await revealed).reveal).toEqual({ correctOptionId: "a" });
    const shown = await nextEvent<any>(proj, EV.results, (r) => r?.data?.revealed === true);
    expect(shown.data).toMatchObject({ correct: 1, counts: { a: 1, b: 1 } });

    const mine = await emit(ps[0]!.s, EV.myResult, { slideId: "quiz1" });
    expect(mine).toMatchObject({ ok: true, answered: true, correct: true });
    expect(mine.points).toBeGreaterThan(950); // risposta quasi istantanea
    expect(mine.points).toBeLessThanOrEqual(1000);
    expect(mine.total).toBe(mine.points);
    expect(await emit(ps[1]!.s, EV.myResult, { slideId: "quiz1" })).toMatchObject({ ok: true, correct: false, points: 0 });

    // Punteggi solo in Redis, con scadenza
    expect(await srv.redis.pttl(K.score(sess.sid))).toBeGreaterThan(0);
  });

  it("quiz a risposta scritta e timer allo scadere", async () => {
    const { ctrl, ps } = await setup(1);
    await emit(ctrl, EV.quizTimer, { enabled: true, factor: 1 });
    await emit(ctrl, EV.goto, { index: 2 });
    await emit(ps[0]!.s, EV.answer, { slideId: "quiz2", answer: { text: " ATTIVO! " } });
    // Il timer da 10 s si chiude da solo
    const st = await nextEvent<SessionState>(ps[0]!.s, EV.state, (x) => x.index === 2 && x.locked, 12_000);
    expect(st.reveal).toEqual({ acceptedAnswers: ["attivo"] });
    const mine = await emit(ps[0]!.s, EV.myResult, { slideId: "quiz2" });
    expect(mine).toMatchObject({ correct: true });
    expect(mine.points).toBeGreaterThan(900);
  }, 20_000);

  it("WCAG 2.2.1: timer disattivabile (1000 punti fissi) e allungabile (×2)", async () => {
    const { ctrl, ps } = await setup(1);
    await emit(ctrl, EV.quizTimer, { enabled: true, factor: 2 });
    const st = nextEvent<SessionState>(ps[0]!.s, EV.state, (x) => x.index === 1);
    await emit(ctrl, EV.goto, { index: 1 });
    const s1 = await st;
    expect(s1.timerEnd! - s1.now).toBeGreaterThan(39_000);
    expect(s1.quizTimer).toEqual({ enabled: true, factor: 2 });

    const off = nextEvent<SessionState>(ps[0]!.s, EV.state, (x) => x.quizTimer.enabled === false);
    await emit(ctrl, EV.quizTimer, { enabled: false, factor: 1 });
    expect((await off).timerEnd).toBeNull();
    await emit(ps[0]!.s, EV.answer, { slideId: "quiz1", answer: { optionId: "a" } });
    await emit(ctrl, EV.lock, { locked: true });
    expect(await emit(ps[0]!.s, EV.myResult, { slideId: "quiz1" })).toMatchObject({ correct: true, points: 1000 });
    expect(await emit(ctrl, EV.quizTimer, { enabled: true, factor: 3 })).toEqual({ ok: false, error: "invalid" });
  });

  it("timer della Regia: durata libera fino a 5 minuti, estensioni mai oltre i 5 minuti", async () => {
    const { ctrl, ps } = await setup(1);
    await emit(ctrl, EV.goto, { index: 3 });
    expect(await emit(ctrl, EV.timer, { seconds: 301 })).toEqual({ ok: false, error: "invalid" });
    expect(await emit(ctrl, EV.timer, { seconds: 4 })).toEqual({ ok: false, error: "invalid" });
    const st = nextEvent<SessionState>(ps[0]!.s, EV.state, (x) => !!x.timerEnd);
    expect(await emit(ctrl, EV.timer, { seconds: 290 })).toEqual({ ok: true });
    const s1 = await st;
    expect(s1.timerEnd! - s1.now).toBeLessThanOrEqual(290_000);
    const ext = nextEvent<SessionState>(ps[0]!.s, EV.state, (x) => !!x.timerEnd && x.timerEnd > s1.timerEnd!);
    await emit(ctrl, EV.timerAdd, { seconds: 30 });
    const s2 = await ext;
    expect(s2.timerEnd! - s2.now).toBeLessThanOrEqual(300_000);
    await emit(ctrl, EV.timer, { seconds: null });
  });
});

describe("Q&A anonimo", () => {
  it("domande, upvote (uno per token), filtro, nascondi, segna come risposta, limite per partecipante", async () => {
    const { sess, ctrl, proj, ps } = await setup(2);
    await emit(ctrl, EV.goto, { index: 3 });
    const [a, b] = ps as [{ s: any; token: string }, { s: any; token: string }];

    expect(await emit(a.s, EV.qaAsk, { slideId: "qa1", text: "Come si dà un feedback efficace?" })).toMatchObject({ ok: true, asked: 1 });
    expect(await emit(a.s, EV.qaAsk, { slideId: "qa1", text: "Che c4zz0 di domanda" })).toMatchObject({ ok: true, asked: 2 });
    expect(await emit(a.s, EV.qaAsk, { slideId: "qa1", text: "Terza domanda" })).toMatchObject({ ok: true, asked: 3 });
    expect(await emit(a.s, EV.qaAsk, { slideId: "qa1", text: "Quarta" })).toEqual({ ok: false, error: "limit_reached" });

    // I partecipanti ricevono l'elenco pubblico per votare (senza filtrate né autori)
    const pub = await nextEvent<any>(b.s, EV.qa, (m) => m.items.length === 2);
    expect(JSON.stringify(pub)).not.toMatch(/c4zz0|Persona|token/);
    const q1 = pub.items.find((i: any) => i.text.startsWith("Come"));

    expect(await emit(b.s, EV.qaVote, { slideId: "qa1", qid: q1.id })).toEqual({ ok: true, votes: 1 });
    expect(await emit(b.s, EV.qaVote, { slideId: "qa1", qid: q1.id })).toEqual({ ok: false, error: "already_answered" });
    expect(await emit(a.s, EV.qaVote, { slideId: "qa1", qid: q1.id })).toEqual({ ok: true, votes: 2 });
    expect(await emit(b.s, EV.qaVote, { slideId: "qa1", qid: "999" })).toEqual({ ok: false, error: "not_found" });

    // Dopo una riconnessione il partecipante ritrova i propri voti
    const st = await emit(b.s, EV.qaState, { slideId: "qa1" });
    expect(st).toMatchObject({ ok: true, voted: [q1.id], asked: 0 });

    // Proiezione: ordinate per voti, filtrata assente; Regia: conteggio filtrate
    const pr = await nextEvent<any>(proj, EV.results, (r) => r?.data?.items?.[0]?.votes === 2);
    expect(pr.data.items[0].text).toBe("Come si dà un feedback efficace?");
    expect(JSON.stringify(pr)).not.toContain("c4zz0");
    // Regia: segna come risposta e nascondi (la Regia vede anche il conteggio delle filtrate)
    const ctrlRes = nextEvent<any>(ctrl, EV.results, (r) => r?.data?.filtered === 1 && r.data.items.some((i: any) => i.answered));
    await emit(ctrl, EV.qaMark, { slideId: "qa1", qid: q1.id, answered: true });
    await ctrlRes;
    await nextEvent<any>(proj, EV.results, (r) => r?.data?.items?.find((i: any) => i.id === q1.id)?.answered === true);
    const other = pr.data.items.find((i: any) => i.id !== q1.id);
    await emit(ctrl, EV.hide, { slideId: "qa1", itemId: other.id, hidden: true });
    await nextEvent<any>(proj, EV.results, (r) => r?.data?.items?.length === 1);
    await nextEvent<any>(b.s, EV.qa, (m) => m.items.length === 1);
    expect(await emit(b.s, EV.qaVote, { slideId: "qa1", qid: other.id })).toEqual({ ok: false, error: "not_found" });

    // Nessun voto è collegato a un nickname: in Redis solo hash dei token
    const keys = await sessionKeys(srv.redis, sess.sid);
    const dumps = await Promise.all(keys.map((k) => srv.redis.dumpBuffer(k)));
    expect(dumps.some((d) => d?.toString("latin1").includes(a.token))).toBe(false);
    for (const k of keys) expect(await srv.redis.pttl(k), k).toBeGreaterThan(0);

    // Chiusura: nessuna chiave residua, compresi i set dei votanti
    await emit(ctrl, EV.close);
    await new Promise((r) => setTimeout(r, 200));
    expect(await sessionKeys(srv.redis, sess.sid)).toEqual([]);
  });
});

describe("griglia 2x2, ranking, 100 punti", () => {
  it("punti medi, posizione media, media dei punti", async () => {
    const { ctrl, proj, ps } = await setup(2);
    const [a, b] = ps as unknown as [{ s: any }, { s: any }];

    await emit(ctrl, EV.goto, { index: 4 });
    await emit(a.s, EV.answer, { slideId: "grid1", answer: { positions: { i1: { x: 20, y: 80 }, i2: { x: 60, y: 10 } } } });
    await emit(b.s, EV.answer, { slideId: "grid1", answer: { positions: { i1: { x: 40, y: 60 }, i2: { x: 80, y: 30 } } } });
    const g = await nextEvent<any>(proj, EV.results, (r) => r?.data?.respondents === 2);
    expect(g.data.points).toEqual({ i1: { x: 30, y: 70, count: 2 }, i2: { x: 70, y: 20, count: 2 } });

    await emit(ctrl, EV.goto, { index: 5 });
    await emit(a.s, EV.answer, { slideId: "rank1", answer: { order: ["a", "b", "c"] } });
    await emit(b.s, EV.answer, { slideId: "rank1", answer: { order: ["b", "a", "c"] } });
    const r = await nextEvent<any>(proj, EV.results, (x) => x?.data?.type === "ranking" && x.data.respondents === 2);
    expect(r.data.avgRank).toEqual({ a: 1.5, b: 1.5, c: 3 });

    await emit(ctrl, EV.goto, { index: 6 });
    await emit(a.s, EV.answer, { slideId: "pts1", answer: { points: { a: 70, b: 30 } } });
    await emit(b.s, EV.answer, { slideId: "pts1", answer: { points: { a: 100 } } });
    expect(await emit(b.s, EV.answer, { slideId: "pts1", answer: { points: { a: 100 } } })).toEqual({ ok: false, error: "already_answered" });
    const p = await nextEvent<any>(proj, EV.results, (x) => x?.data?.type === "points" && x.data.respondents === 2);
    expect(p.data.avg).toEqual({ a: 85, b: 15 });
  });
});
