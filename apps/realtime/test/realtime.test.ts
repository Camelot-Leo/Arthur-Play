import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@arthur/db";
import { EV, type SessionState } from "@arthur/shared";
import { K, sessionKeys, signTicket } from "@arthur/shared/server";
import { SECRET, activity, emit, newSession, nextEvent, socket, startServer, waitConnect } from "./helpers";

let srv: Awaited<ReturnType<typeof startServer>>;

beforeAll(async () => {
  if (!process.env.REDIS_URL?.endsWith("/15")) throw new Error("I test devono usare il database Redis 15");
  srv = await startServer();
  await srv.redis.flushdb();
});
afterAll(async () => {
  await srv.stop();
});

async function participant(code: string, nickname: string) {
  const s = srv.track(socket(srv.url, { role: "participant", code }));
  await waitConnect(s);
  const res = await emit(s, EV.join, { nickname });
  return { s, res };
}

async function control(ticket: string, role: "control" | "projection" = "control") {
  const s = srv.track(socket(srv.url, { role, ticket }));
  await waitConnect(s);
  const init = await emit(s, EV.init);
  return { s, init };
}

describe("ingresso", () => {
  it("codice inesistente: connessione rifiutata", async () => {
    const s = srv.track(socket(srv.url, { role: "participant", code: "000000" }));
    await expect(waitConnect(s)).rejects.toThrow("not_found");
  });

  it("nickname: lunghezza, unicità e filtro", async () => {
    const sess = await newSession(srv.redis);
    const a = await participant(sess.code, "Volpe Audace 12");
    expect(a.res.ok).toBe(true);
    expect(a.res.token).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    const dup = await emit(a.s, EV.join, { nickname: "volpe audace 12" });
    expect(dup).toEqual({ ok: false, error: "nickname_taken" });
    expect(await emit(a.s, EV.join, { nickname: "x" })).toEqual({ ok: false, error: "nickname_invalid" });
    expect(await emit(a.s, EV.join, { nickname: "Str0nz0" })).toEqual({ ok: false, error: "nickname_filtered" });
  });

  it("la Regia richiede un ticket valido del proprietario", async () => {
    const sess = await newSession(srv.redis);
    const forged = await signTicket("un-altro-segreto-un-altro-segreto-123456", { sid: sess.sid, uid: "owner-1", role: "control" });
    await expect(waitConnect(srv.track(socket(srv.url, { role: "control", ticket: forged })))).rejects.toThrow("unauthorized");
    const other = await signTicket(SECRET, { sid: sess.sid, uid: "altro-utente", role: "control" });
    await expect(waitConnect(srv.track(socket(srv.url, { role: "control", ticket: other })))).rejects.toThrow("not_found");
    // Un ticket di Proiezione non può comandare la sessione
    const proj = await control(sess.projection, "projection");
    expect(await (proj.s.timeout(1000) as any).emitWithAck(EV.goto, { index: 1 }).catch(() => "nessuna risposta")).toBe("nessuna risposta");
  });
});

describe("sessione live", () => {
  it("avanzamento, risultati in Proiezione entro 1 secondo, blocco dei doppi invii", async () => {
    const sess = await newSession(srv.redis);
    const ctrl = await control(sess.control);
    expect(ctrl.init.ok).toBe(true);
    expect(ctrl.init.activity.slides[0].notes).toBe("Nota segreta del facilitatore");
    const proj = await control(sess.projection, "projection");
    expect(proj.init.activity.slides[0].notes).toBeUndefined();

    const p = await participant(sess.code, "Lince Tenace 33");
    const stateP = nextEvent<SessionState>(p.s, EV.state, (st) => st.index === 1);
    expect(await emit(ctrl.s, EV.goto, { index: 1 })).toEqual({ ok: true });
    const st = await stateP;
    expect(st.slide.type).toBe("choice");
    expect((st.slide as { notes?: string }).notes).toBeUndefined();

    const t0 = Date.now();
    const got = nextEvent(proj.s, EV.results, (r: any) => r?.data?.counts?.a === 1);
    expect(await emit(p.s, EV.answer, { slideId: "q1", answer: { optionIds: ["a"] } })).toEqual({ ok: true, answered: 1 });
    await got;
    expect(Date.now() - t0).toBeLessThan(1000);

    expect(await emit(p.s, EV.answer, { slideId: "q1", answer: { optionIds: ["b"] } })).toEqual({ ok: false, error: "already_answered" });
    expect(await emit(p.s, EV.answer, { slideId: "q2", answer: { text: "x" } })).toEqual({ ok: false, error: "not_current" });
    expect(await emit(p.s, EV.answer, { slideId: "q1", answer: { optionIds: ["zzz"] } })).toMatchObject({ ok: false });
  });

  it("i partecipanti non ricevono mai i risultati", async () => {
    const sess = await newSession(srv.redis);
    const ctrl = await control(sess.control);
    const p = await participant(sess.code, "Gufo Agile 10");
    let leaked = false;
    p.s.on(EV.results, () => (leaked = true));
    await emit(ctrl.s, EV.goto, { index: 1 });
    await emit(p.s, EV.answer, { slideId: "q1", answer: { optionIds: ["a"] } });
    await new Promise((r) => setTimeout(r, 400));
    expect(leaked).toBe(false);
  });

  it("moderazione: le risposte filtrate non arrivano mai in Proiezione; nascondi dalla Regia", async () => {
    const sess = await newSession(srv.redis);
    const ctrl = await control(sess.control);
    const proj = await control(sess.projection, "projection");
    const p = await participant(sess.code, "Panda Forte 55");
    await emit(ctrl.s, EV.goto, { index: 2 });

    const projPayloads: string[] = [];
    proj.s.on(EV.results, (r) => projPayloads.push(JSON.stringify(r)));

    expect(await emit(p.s, EV.answer, { slideId: "q2", answer: { text: "che c4zz4t4" } })).toMatchObject({ ok: true });
    expect(await emit(p.s, EV.answer, { slideId: "q2", answer: { text: "Fiducia reciproca" } })).toMatchObject({ ok: true, answered: 2 });
    expect(await emit(p.s, EV.answer, { slideId: "q2", answer: { text: "terza" } })).toEqual({ ok: false, error: "already_answered" });

    const ctrlRes = await nextEvent<any>(ctrl.s, EV.results, (r) => r?.data?.items?.length === 1 && r.data.filtered === 1);
    await nextEvent<any>(proj.s, EV.results, (r) => r?.data?.items?.length === 1);
    const item = ctrlRes.data.items[0];
    expect(item.text).toBe("Fiducia reciproca");

    // Nascondi dalla Proiezione con un tocco
    await emit(ctrl.s, EV.hide, { slideId: "q2", itemId: item.id, hidden: true });
    await nextEvent<any>(proj.s, EV.results, (r) => r?.data?.items?.length === 0);
    const hiddenCtrl = await nextEvent<any>(ctrl.s, EV.results, (r) => r?.data?.items?.[0]?.hidden === true, 2000).catch(() => null);
    expect(hiddenCtrl === null || hiddenCtrl.data.items[0].hidden === true).toBe(true);

    for (const payload of projPayloads) {
      expect(payload).not.toMatch(/c4zz4t4|cazzata/i);
      expect(payload).not.toMatch(/"filtered":[1-9]/);
    }
    // Il testo filtrato non è salvato in Redis
    const all = await Promise.all((await sessionKeys(srv.redis, sess.sid)).map((k) => srv.redis.dumpBuffer(k)));
    expect(all.some((b) => b && b.toString("latin1").includes("c4zz4t4"))).toBe(false);
  });

  it("word cloud: voci filtrate escluse, voci nascoste escluse dalla Proiezione", async () => {
    const sess = await newSession(srv.redis);
    const ctrl = await control(sess.control);
    const proj = await control(sess.projection, "projection");
    const p1 = await participant(sess.code, "Tigre Nobile 21");
    const p2 = await participant(sess.code, "Zebra Docile 22");
    await emit(ctrl.s, EV.goto, { index: 3 });
    await emit(p1.s, EV.answer, { slideId: "q3", answer: { words: ["Ascolto", "m e r d a", "fiducia"] } });
    await emit(p2.s, EV.answer, { slideId: "q3", answer: { words: ["ascolto", "F.U.C.K"] } });
    const r = await nextEvent<any>(proj.s, EV.results, (x) => x?.data?.words?.length === 2);
    expect(r.data.words).toEqual([
      { word: "ascolto", count: 2 },
      { word: "fiducia", count: 1 },
    ]);
    await emit(ctrl.s, EV.hide, { slideId: "q3", itemId: "fiducia", hidden: true });
    await nextEvent<any>(proj.s, EV.results, (x) => x?.data?.words?.length === 1);
  });

  it("scala: media e distribuzione", async () => {
    const sess = await newSession(srv.redis);
    const ctrl = await control(sess.control);
    const proj = await control(sess.projection, "projection");
    await emit(ctrl.s, EV.goto, { index: 4 });
    for (const [i, v] of [2, 4, 4].entries()) {
      const p = await participant(sess.code, `Orso Forte ${i + 10}`);
      await emit(p.s, EV.answer, { slideId: "q4", answer: { values: { s1: v } } });
    }
    const r = await nextEvent<any>(proj.s, EV.results, (x) => x?.data?.respondents === 3);
    expect(r.data.stats.s1.avg).toBeCloseTo(10 / 3);
    expect(r.data.stats.s1.dist).toEqual([0, 1, 0, 2, 0]);
  });

  it("controlli: nascondi risultati, blocca, riapri, timer", async () => {
    const sess = await newSession(srv.redis);
    const ctrl = await control(sess.control);
    const proj = await control(sess.projection, "projection");
    const p = await participant(sess.code, "Falco Abile 40");
    await emit(ctrl.s, EV.goto, { index: 1 });

    await emit(ctrl.s, EV.showResults, { visible: false });
    await nextEvent<any>(proj.s, EV.results, (r) => r.data === null);

    await emit(ctrl.s, EV.lock, { locked: true });
    expect(await emit(p.s, EV.answer, { slideId: "q1", answer: { optionIds: ["a"] } })).toEqual({ ok: false, error: "locked" });

    await emit(ctrl.s, EV.goto, { index: 2 });
    const reopened = nextEvent<SessionState>(p.s, EV.state, (st) => st.index === 1 && !st.locked);
    await emit(ctrl.s, EV.reopen, { index: 1 });
    await reopened;
    expect(await emit(p.s, EV.answer, { slideId: "q1", answer: { optionIds: ["a"] } })).toMatchObject({ ok: true });

    // Timer: allo scadere le risposte si chiudono; +30 s le riapre
    await emit(ctrl.s, EV.goto, { index: 2 });
    const locked = nextEvent<SessionState>(p.s, EV.state, (st) => st.index === 2 && st.locked, 8000);
    await emit(ctrl.s, EV.timer, { seconds: 5 });
    await locked;
    expect(await emit(p.s, EV.answer, { slideId: "q2", answer: { text: "tardi" } })).toEqual({ ok: false, error: "locked" });
    await emit(ctrl.s, EV.timerAdd, { seconds: 30 });
    expect(await emit(p.s, EV.answer, { slideId: "q2", answer: { text: "in tempo" } })).toMatchObject({ ok: true });
    await emit(ctrl.s, EV.timer, { seconds: null });
  }, 20_000);

  it("contatore dei partecipanti connessi", async () => {
    const sess = await newSession(srv.redis);
    const ctrl = await control(sess.control);
    const two = nextEvent<any>(ctrl.s, EV.presence, (x) => x.count === 2);
    const p1 = await participant(sess.code, "Koala Felice 11");
    await participant(sess.code, "Koala Felice 12");
    await two;
    const one = nextEvent<any>(ctrl.s, EV.presence, (x) => x.count === 1);
    p1.s.disconnect();
    await one;
  });
});

describe("riconnessione con token", () => {
  it("dopo una caduta di rete il partecipante riprende la sessione senza perdere lo stato", async () => {
    const sess = await newSession(srv.redis);
    const ctrl = await control(sess.control);
    await emit(ctrl.s, EV.goto, { index: 1 });
    const p = await participant(sess.code, "Delfino Solare 70");
    await emit(p.s, EV.answer, { slideId: "q1", answer: { optionIds: ["a"] } });
    p.s.disconnect();

    const again = srv.track(socket(srv.url, { role: "participant", code: sess.code }));
    await waitConnect(again);
    const res = await emit(again, EV.resume, { token: p.res.token });
    expect(res).toMatchObject({ ok: true, nickname: "Delfino Solare 70", answered: 1 });
    // Il blocco dei doppi invii resta attivo dopo la riconnessione
    expect(await emit(again, EV.answer, { slideId: "q1", answer: { optionIds: ["b"] } })).toEqual({ ok: false, error: "already_answered" });
    expect(await emit(again, EV.resume, { token: "token-inventato" })).toEqual({ ok: false, error: "not_found" });
  });
});

describe("chiusura e scadenza", () => {
  it("chiusura: tutti i client avvisati, nessuna chiave Redis residua", async () => {
    const sess = await newSession(srv.redis);
    const ctrl = await control(sess.control);
    const proj = await control(sess.projection, "projection");
    const p = await participant(sess.code, "Cervo Veloce 90");
    await emit(ctrl.s, EV.goto, { index: 2 });
    await emit(p.s, EV.answer, { slideId: "q2", answer: { text: "Risposta da cancellare" } });
    const endedP = nextEvent(p.s, EV.ended);
    const endedProj = nextEvent(proj.s, EV.ended);
    expect(await emit(ctrl.s, EV.close)).toEqual({ ok: true });
    await Promise.all([endedP, endedProj]);
    await new Promise((r) => setTimeout(r, 300));
    expect(await sessionKeys(srv.redis, sess.sid)).toEqual([]);
    expect(await srv.redis.exists(K.code(sess.code))).toBe(0);
    const everything = await srv.redis.keys("*");
    expect(everything.filter((k) => k.includes(sess.sid))).toEqual([]);
  });

  it("scadenza: dopo il TTL non resta nulla e i client ricevono la fine", async () => {
    const sess = await newSession(srv.redis, 2);
    const ctrl = await control(sess.control);
    const p = await participant(sess.code, "Lupo Capace 91");
    await emit(ctrl.s, EV.goto, { index: 2 });
    await emit(p.s, EV.answer, { slideId: "q2", answer: { text: "scadrà" } });
    await nextEvent(p.s, EV.ended, () => true, 5000);
    expect(await sessionKeys(srv.redis, sess.sid)).toEqual([]);
    expect(await srv.redis.exists(K.code(sess.code))).toBe(0);
  });
});

describe("privacy: nessun dato dei partecipanti in log e database", () => {
  it("i log non contengono nickname, testi delle risposte, token o IP", async () => {
    const sess = await newSession(srv.redis);
    const ctrl = await control(sess.control);
    const p = await participant(sess.code, "Nickname Tracciante");
    await emit(ctrl.s, EV.goto, { index: 2 });
    await emit(p.s, EV.answer, { slideId: "q2", answer: { text: "Testo tracciante 123" } });
    // Evento non valido per forzare un percorso di errore
    await emit(p.s, EV.answer, { slideId: "q2", answer: { text: { nested: "Testo tracciante 456" } } });
    srv.logger.error({ err: new Error("Testo tracciante 789 nel messaggio") }, "prova errore");
    await emit(ctrl.s, EV.close);
    const logs = srv.logLines.join("\n");
    expect(logs).not.toContain("Nickname Tracciante");
    expect(logs).not.toContain("Testo tracciante");
    expect(logs).not.toContain(p.res.token);
    expect(logs).not.toContain("127.0.0.1");
  });

  it("PostgreSQL non contiene alcun dato dei partecipanti", async () => {
    const { client: sql } = createDb(process.env.DATABASE_URL, 1);
    const cols = await sql<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`;
    const names = cols.map((c) => `${c.table_name}.${c.column_name}`);
    for (const forbidden of ["nickname", "answer", "response", "ip", "participant", "token\b"]) {
      expect(names.some((n) => new RegExp(`\\.${forbidden}`).test(n)), forbidden).toBe(false);
    }
    // Nessun valore dei test precedenti è finito nel database
    for (const t of new Set(cols.map((c) => c.table_name))) {
      const rows = await sql`SELECT * FROM ${sql(t)}`;
      const dump = JSON.stringify(rows);
      expect(dump).not.toContain("Nickname Tracciante");
      expect(dump).not.toContain("Testo tracciante");
    }
    await sql.end();
    expect(activity.slides.length).toBeGreaterThan(0);
  });
});
