import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, EV, type ActivityContent, type SessionState } from "@arthur/shared";
import { K, createSession, sessionKeys, signTicket } from "@arthur/shared/server";
import { SECRET, emit, nextEvent, socket, startServer, waitConnect } from "./helpers";

let srv: Awaited<ReturnType<typeof startServer>>;
const activity: ActivityContent = {
  title: "Temi",
  settings: DEFAULT_SETTINGS,
  slides: [
    { id: "o1", type: "open", question: "Cosa rende efficace una squadra?", maxAnswers: 1 },
    { id: "c1", type: "content", title: "Fine" },
  ],
};

beforeAll(async () => {
  if (!process.env.REDIS_URL?.endsWith("/15")) throw new Error("I test devono usare il database Redis 15");
  srv = await startServer();
});
afterAll(async () => {
  await srv.stop();
});

describe("temi AI in Proiezione", () => {
  it("mostrati solo su comando della Regia, nascosti cambiando slide, cancellati con la sessione", async () => {
    const sess = await createSession(srv.redis, { ownerId: "o", activity });
    const ctrl = srv.track(socket(srv.url, { role: "control", ticket: await signTicket(SECRET, { sid: sess.sid, uid: "o", role: "control" }) }));
    const proj = srv.track(socket(srv.url, { role: "projection", ticket: await signTicket(SECRET, { sid: sess.sid, uid: "o", role: "projection" }) }));
    await Promise.all([waitConnect(ctrl), waitConnect(proj)]);
    await Promise.all([emit(ctrl, EV.init), emit(proj, EV.init)]);

    // Senza temi calcolati non si possono mostrare
    expect(await emit(ctrl, EV.themes, { slideId: "o1", visible: true })).toEqual({ ok: false, error: "not_found" });

    // Il servizio web salva i temi in Redis con la scadenza della sessione
    const themes = [{ label: "Fiducia", count: 6, examples: ["Fiducia reciproca"] }];
    await srv.redis.set(K.themes(sess.sid, "o1"), JSON.stringify(themes), "PXAT", sess.expiresAt);

    const shown = nextEvent<any>(proj, EV.results, (r) => !!r.themes);
    const st = nextEvent<SessionState>(proj, EV.state, (s) => s.themesVisible);
    expect(await emit(ctrl, EV.themes, { slideId: "o1", visible: true })).toEqual({ ok: true });
    expect((await shown).themes).toEqual(themes);
    await st;

    const off = nextEvent<SessionState>(proj, EV.state, (s) => s.index === 1 && !s.themesVisible);
    await emit(ctrl, EV.goto, { index: 1 });
    await off;

    await emit(ctrl, EV.close);
    await new Promise((r) => setTimeout(r, 200));
    expect(await sessionKeys(srv.redis, sess.sid)).toEqual([]);
  });
});
