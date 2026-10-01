import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ASYNC_SESSION_MAX_SECONDS, DEFAULT_SETTINGS, EV, LIVE_SESSION_TTL_SECONDS, type ActivityContent } from "@arthur/shared";
import { K, createSession, getMeta, sessionKeys, signTicket } from "@arthur/shared/server";
import { SECRET, emit, nextEvent, socket, startServer, waitConnect } from "./helpers";

let srv: Awaited<ReturnType<typeof startServer>>;

const activity: ActivityContent = {
  title: "A ritmo libero",
  settings: DEFAULT_SETTINGS,
  slides: [
    { id: "intro", type: "content", title: "Benvenuti", notes: "Nota privata" },
    {
      id: "c1",
      type: "choice",
      question: "Come ti senti?",
      multiple: false,
      options: [
        { id: "a", label: "Bene" },
        { id: "b", label: "Male" },
      ],
    },
    {
      id: "q1",
      type: "quiz",
      question: "Che cos'è l'ascolto attivo?",
      mode: "single",
      options: [
        { id: "a", label: "Prestare piena attenzione" },
        { id: "b", label: "Aspettare il proprio turno" },
      ],
      correctOptionId: "a",
      acceptedAnswers: [],
      timerSeconds: 20,
      explanation: "Ascoltare attivamente significa concentrarsi su chi parla.",
    },
    { id: "q2", type: "quiz", question: "Scrivi la parola chiave", mode: "text", options: [], acceptedAnswers: ["empatia"], timerSeconds: null },
    { id: "o1", type: "open", question: "Un pensiero", maxAnswers: 1 },
  ],
};

beforeAll(async () => {
  if (!process.env.REDIS_URL?.endsWith("/15")) throw new Error("I test devono usare il database Redis 15");
  srv = await startServer();
});
afterAll(async () => {
  await srv.stop();
});

async function setup(ttlSeconds = 3600) {
  const sess = await createSession(srv.redis, { ownerId: "o", activity, mode: "async", ttlSeconds });
  const ctrl = srv.track(socket(srv.url, { role: "control", ticket: await signTicket(SECRET, { sid: sess.sid, uid: "o", role: "control" }) }));
  await waitConnect(ctrl);
  const init = await emit(ctrl, EV.init);
  const join = async (token?: string) => {
    const s = srv.track(socket(srv.url, { role: "participant", code: sess.code }));
    await waitConnect(s);
    const res = token ? await emit(s, EV.resume, { token }) : await emit(s, EV.join, {});
    return { s, res };
  };
  return { sess, ctrl, init, join };
}

describe("scadenza delle attività a ritmo libero", () => {
  it("scadenza scelta dal facilitatore, mai oltre 14 giorni (live: mai oltre 24 ore)", async () => {
    const a = await createSession(srv.redis, { ownerId: "o", activity, mode: "async", ttlSeconds: 30 * 24 * 3600 });
    const ttlA = await srv.redis.pttl(K.meta(a.sid));
    expect(ttlA).toBeLessThanOrEqual(ASYNC_SESSION_MAX_SECONDS * 1000);
    expect(ttlA).toBeGreaterThan((ASYNC_SESSION_MAX_SECONDS - 60) * 1000);
    expect((await getMeta(srv.redis, a.sid))?.mode).toBe("async");
    for (const k of [...(await sessionKeys(srv.redis, a.sid)), K.code(a.code)]) expect(await srv.redis.pttl(k)).toBeLessThanOrEqual(ASYNC_SESSION_MAX_SECONDS * 1000);

    const b = await createSession(srv.redis, { ownerId: "o", activity, mode: "async", ttlSeconds: 3 * 24 * 3600 });
    expect(await srv.redis.pttl(K.meta(b.sid))).toBeLessThanOrEqual(3 * 24 * 3600 * 1000);
    const c = await createSession(srv.redis, { ownerId: "o", activity, ttlSeconds: 7 * 24 * 3600 });
    expect(await srv.redis.pttl(K.meta(c.sid))).toBeLessThanOrEqual(LIVE_SESSION_TTL_SECONDS * 1000);
  });

  it("alla scadenza risultati e chiavi spariscono, il codice non funziona più, la dashboard viene avvisata", async () => {
    const { sess, ctrl, join } = await setup(2);
    const p = await join();
    await emit(p.s, EV.answer, { slideId: "o1", answer: { text: "Un pensiero che scadrà" } });
    await emit(p.s, EV.answer, { slideId: "c1", answer: { optionIds: ["a"] } });
    await nextEvent(ctrl, EV.ended, () => true, 5000);
    expect(await sessionKeys(srv.redis, sess.sid)).toEqual([]);
    expect(await srv.redis.exists(K.code(sess.code))).toBe(0);
    const late = srv.track(socket(srv.url, { role: "participant", code: sess.code }));
    await expect(waitConnect(late)).rejects.toThrow("not_found");
  });
});

describe("partecipazione a ritmo libero", () => {
  it("ingresso senza nickname; slide pubbliche senza note né soluzioni", async () => {
    const { join, init } = await setup();
    expect(init.state.mode).toBe("async");
    const p = await join();
    expect(p.res).toMatchObject({ ok: true, nickname: "", mode: "async", team: null, answeredSlides: {} });
    expect(p.res.slides).toHaveLength(5);
    const dump = JSON.stringify(p.res.slides);
    expect(dump).not.toContain("Nota privata");
    expect(dump).not.toContain("correctOptionId");
    expect(dump).not.toContain("empatia");
    expect(dump).not.toContain("concentrarsi");
  });

  it("blocco dei doppi invii: per slide, in qualunque ordine, anche dopo la riconnessione", async () => {
    const { join } = await setup();
    const p = await join();
    // Ordine libero: si parte dall'ultima slide
    expect(await emit(p.s, EV.answer, { slideId: "o1", answer: { text: "Prima risposta" } })).toEqual({ ok: true, answered: 1 });
    expect(await emit(p.s, EV.answer, { slideId: "c1", answer: { optionIds: ["b"] } })).toEqual({ ok: true, answered: 1 });
    expect(await emit(p.s, EV.answer, { slideId: "c1", answer: { optionIds: ["a"] } })).toEqual({ ok: false, error: "already_answered" });
    expect(await emit(p.s, EV.answer, { slideId: "o1", answer: { text: "Seconda" } })).toEqual({ ok: false, error: "already_answered" });
    expect(await emit(p.s, EV.answer, { slideId: "intro", answer: {} })).toEqual({ ok: false, error: "not_current" });
    expect(await emit(p.s, EV.answer, { slideId: "inesistente", answer: {} })).toEqual({ ok: false, error: "not_current" });

    // Riconnessione (giorni dopo): stesso token, stesso stato, stesso blocco
    p.s.disconnect();
    const again = await join(p.res.token);
    expect(again.res).toMatchObject({ ok: true, mode: "async", answeredSlides: { o1: 1, c1: 1 } });
    expect(await emit(again.s, EV.answer, { slideId: "c1", answer: { optionIds: ["a"] } })).toEqual({ ok: false, error: "already_answered" });
    expect(await emit(again.s, EV.answer, { slideId: "q1", answer: { optionId: "a" } })).toMatchObject({ ok: true });

    // Un nuovo ingresso è un nuovo token: il blocco è per token (nessun dato di dispositivo o rete)
    const other = await join();
    expect(await emit(other.s, EV.answer, { slideId: "c1", answer: { optionIds: ["a"] } })).toMatchObject({ ok: true });
  });

  it("quiz con riscontro immediato e spiegazione dopo ogni risposta", async () => {
    const { join } = await setup();
    const p = await join();
    expect(await emit(p.s, EV.answer, { slideId: "q1", answer: { optionId: "b" } })).toEqual({
      ok: true,
      answered: 1,
      feedback: { correct: false, correctOptionId: "a", explanation: "Ascoltare attivamente significa concentrarsi su chi parla." },
    });
    expect(await emit(p.s, EV.answer, { slideId: "q2", answer: { text: "Empatia!" } })).toEqual({
      ok: true,
      answered: 1,
      feedback: { correct: true, acceptedAnswers: ["empatia"] },
    });
  });

  it("il facilitatore vede solo aggregati; i comandi dal vivo non esistono", async () => {
    const { ctrl, init, join } = await setup();
    expect(init.allResults.map((r: any) => r.slideId)).toEqual(["c1", "q1", "q2", "o1"]);
    const presence = nextEvent<any>(ctrl, EV.presence, (x) => x.count === 3);
    const ps = await Promise.all([join(), join(), join()]);
    await presence; // partecipanti che hanno iniziato (solo il totale)
    const update = nextEvent<any>(ctrl, EV.results, (r) => r.slideId === "c1" && r.data.respondents === 3);
    for (const [i, p] of ps.entries()) await emit(p.s, EV.answer, { slideId: "c1", answer: { optionIds: [i === 0 ? "b" : "a"] } });
    const res = await update;
    expect(res.data.counts).toEqual({ a: 2, b: 1 });
    expect(JSON.stringify(res)).not.toMatch(/token|nickname/i);
    for (const ev of [EV.goto, EV.lock, EV.timer, EV.view, EV.quizTimer]) {
      expect(await emit(ctrl, ev, { index: 1, locked: true, seconds: 30, view: "slide", enabled: true, factor: 1 })).toMatchObject({ ok: false });
    }
  });
});
