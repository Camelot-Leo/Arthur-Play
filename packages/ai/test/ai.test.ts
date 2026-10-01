/**
 * Funzioni AI con API simulata (nessuna chiamata reale ad Anthropic).
 * Criterio della Fase 5: all'AI non arriva mai alcun nickname, token, codice o identificativo
 * di sessione, né alcuna risposta filtrata o nascosta.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { z } from "zod";
import { DEFAULT_SETTINGS, EV, type ActivityContent } from "@arthur/shared";
import { K, SEED_TERMS, createSession, signTicket } from "@arthur/shared/server";
import { SECRET, emit, socket, startServer, waitConnect } from "../../../apps/realtime/test/helpers";
import {
  AiRefusedError,
  DocumentError,
  GenActivitySchema,
  MIN_THEME_RESPONSES,
  TooFewResponsesError,
  aiConfig,
  collectThemeInputs,
  extractDocumentText,
  generateActivity,
  groupThemes,
  withFallbacks,
  type AiRequest,
  type AiTransport,
} from "../src";

/** Trasporto simulato: registra ogni richiesta e restituisce la risposta preparata. */
function mockTransport(reply: (req: AiRequest) => unknown) {
  const requests: AiRequest[] = [];
  const transport: AiTransport = {
    async structured<S extends z.ZodType>(req: AiRequest, schema: S) {
      requests.push(req);
      return schema.parse(reply(req)) as z.infer<S>;
    },
  };
  return { transport, requests };
}

let srv: Awaited<ReturnType<typeof startServer>>;

const activity: ActivityContent = {
  title: "Temi",
  settings: DEFAULT_SETTINGS,
  slides: [
    { id: "o1", type: "open", question: "Cosa rende efficace una squadra?", maxAnswers: 2 },
    { id: "w1", type: "wordcloud", question: "Una parola sulla fiducia", maxEntries: 2 },
  ],
};

beforeAll(async () => {
  if (!process.env.REDIS_URL?.endsWith("/15")) throw new Error("I test devono usare il database Redis 15");
  srv = await startServer();
});
afterAll(async () => {
  await srv.stop();
});

describe("configurazione", () => {
  it("funzioni AI disattivate di default; si abilitano solo con AI_ENABLED=1", () => {
    expect(aiConfig({}).enabled).toBe(false);
    expect(aiConfig({ AI_ENABLED: "true" }).enabled).toBe(false);
    expect(aiConfig({ AI_ENABLED: "1" }).enabled).toBe(true);
    expect(aiConfig({}).model).toBe("claude-sonnet-5-5");
    expect(aiConfig({}).fallbackModels).toEqual(["claude-sonnet-5", "claude-haiku-4-5"]);
    expect(aiConfig({ AI_FALLBACK_MODELS: "" }).fallbackModels).toEqual([]);
  });
});

describe("raggruppamento in temi: cosa riceve l'AI", () => {
  it("solo domanda e testi visibili: niente nickname, token, codice, sessione, filtrate, nascoste", async () => {
    const sess = await createSession(srv.redis, { ownerId: "o", activity });
    const ctrl = srv.track(socket(srv.url, { role: "control", ticket: await signTicket(SECRET, { sid: sess.sid, uid: "o", role: "control" }) }));
    await waitConnect(ctrl);
    await emit(ctrl, EV.init);

    const visible = [
      "Fiducia reciproca",
      "Comunicare in modo chiaro",
      "Obiettivi condivisi",
      "Ascoltarsi davvero",
      "Rispetto dei ruoli",
      "Dividersi i compiti",
      "Darsi feedback",
      "Celebrare i successi",
      "Gestire i conflitti",
      "Aiutarsi a vicenda",
      "Sapere chi fa cosa",
    ];
    const tokens: string[] = [];
    const nicknames: string[] = [];
    for (let i = 0; i < 12; i++) {
      const s = srv.track(socket(srv.url, { role: "participant", code: sess.code }));
      await waitConnect(s);
      const nick = `Nickname Segreto ${i + 10}`;
      const res = await emit(s, EV.join, { nickname: nick });
      nicknames.push(nick);
      tokens.push(res.token);
      if (i < visible.length) await emit(s, EV.answer, { slideId: "o1", answer: { text: visible[i] } });
      if (i === 11) {
        // Una risposta filtrata e una che il facilitatore nasconderà
        await emit(s, EV.answer, { slideId: "o1", answer: { text: "Che c4zz4t4 questa domanda" } });
      }
    }
    // Il facilitatore nasconde "Sapere chi fa cosa"
    const raw = await srv.redis.hgetall(K.txt(sess.sid, "o1"));
    const hiddenId = Object.entries(raw).find(([, v]) => v.includes("Sapere chi fa cosa"))![0];
    await emit(ctrl, EV.hide, { slideId: "o1", itemId: hiddenId, hidden: true });

    const inputs = await collectThemeInputs(srv.redis, sess.sid, { id: "o1", type: "open" });
    expect(inputs).toHaveLength(10);

    const { transport, requests } = mockTransport(() => ({
      themes: [
        { label: "Fiducia e ascolto", items: [1, 4, 5] },
        { label: "Organizzazione", items: [2, 3, 6, 9] },
        { label: "Clima positivo", items: [7, 8, 10] },
      ],
    }));
    const themes = await groupThemes(transport, "claude-sonnet-5-5", { question: "Cosa rende efficace una squadra?", inputs, moderation: SEED_TERMS });
    expect(themes.map((t) => t.label)).toEqual(["Organizzazione", "Fiducia e ascolto", "Clima positivo"]);
    expect(themes.reduce((a, t) => a + t.count, 0)).toBe(10);

    expect(requests).toHaveLength(1);
    const sent = JSON.stringify(requests[0]);
    for (const v of visible.slice(0, 10)) expect(sent).toContain(v);
    for (const n of nicknames) expect(sent).not.toContain(n);
    expect(sent).not.toMatch(/Nickname|Segreto/);
    for (const t of tokens) expect(sent).not.toContain(t);
    const tokenHashes = Object.keys(await srv.redis.hgetall(K.participants(sess.sid)));
    expect(tokenHashes).toHaveLength(12);
    for (const h of tokenHashes) expect(sent).not.toContain(h);
    expect(sent).not.toContain(sess.code);
    expect(sent).not.toContain(sess.sid);
    expect(sent).not.toMatch(/c4zz4t4|cazzata/i); // filtrata: mai salvata, mai inviata
    expect(sent).not.toContain("Sapere chi fa cosa"); // nascosta dal facilitatore
    // Solo i campi previsti: modello, istruzioni, testo, sforzo, limite
    expect(Object.keys(requests[0]!).sort()).toEqual(["effort", "maxTokens", "model", "system", "user"]);
  });

  it("word cloud: voci nascoste e filtrate escluse; con meno di 10 risposte nessuna chiamata", async () => {
    const sess = await createSession(srv.redis, { ownerId: "o", activity });
    const ctrl = srv.track(socket(srv.url, { role: "control", ticket: await signTicket(SECRET, { sid: sess.sid, uid: "o", role: "control" }) }));
    await waitConnect(ctrl);
    await emit(ctrl, EV.init);
    await emit(ctrl, EV.goto, { index: 1 });
    const words = [["fiducia", "ascolto"], ["fiducia", "rispetto"], ["onestà", "m.e.r.d.a"], ["ascolto", "tempo"], ["coerenza", "parolanascosta"]];
    for (const [i, pair] of words.entries()) {
      const s = srv.track(socket(srv.url, { role: "participant", code: sess.code }));
      await waitConnect(s);
      await emit(s, EV.join, { nickname: `Parole Segrete ${i + 10}` });
      await emit(s, EV.answer, { slideId: "w1", answer: { words: pair } });
    }
    await emit(ctrl, EV.hide, { slideId: "w1", itemId: "parolanascosta", hidden: true });
    const inputs = await collectThemeInputs(srv.redis, sess.sid, { id: "w1", type: "wordcloud" });
    expect(inputs.map((i) => i.text).sort()).toEqual(["ascolto", "coerenza", "fiducia", "onestà", "rispetto", "tempo"]);
    expect(inputs.reduce((a, i) => a + i.weight, 0)).toBe(8);

    // 8 risposte < 10: nessuna richiesta all'AI
    const { transport, requests } = mockTransport(() => ({ themes: [] }));
    await expect(groupThemes(transport, "m", { question: "Q", inputs, moderation: SEED_TERMS })).rejects.toBeInstanceOf(TooFewResponsesError);
    expect(requests).toHaveLength(0);
    expect(MIN_THEME_RESPONSES).toBe(10);

    // Con abbastanza risposte la richiesta contiene solo le voci visibili (con il peso)
    const enough = [...inputs, { text: "empatia", weight: 2 }];
    const m2 = mockTransport(() => ({ themes: [{ label: "Relazioni", items: [1, 2, 3, 4, 5, 6, 7] }] }));
    await groupThemes(m2.transport, "m", { question: "Una parola sulla fiducia", inputs: enough, moderation: SEED_TERMS });
    const sent = JSON.stringify(m2.requests[0]);
    expect(sent).toContain("fiducia (×2)");
    expect(sent).not.toMatch(/merda|m\.e\.r\.d\.a|parolanascosta|Parole Segrete/);
  });

  it("anche le etichette restituite dall'AI passano dal filtro di moderazione", async () => {
    const inputs = Array.from({ length: 10 }, (_, i) => ({ text: `risposta ${i}`, weight: 1 }));
    const { transport } = mockTransport(() => ({
      themes: [
        { label: "Che c4zz0", items: [1, 2] },
        { label: "Collaborazione", items: [3, 4, 5] },
      ],
    }));
    const themes = await groupThemes(transport, "m", { question: "Q", inputs, moderation: SEED_TERMS });
    expect(themes.map((t) => t.label)).toEqual(["Collaborazione"]);
  });
});

describe("generazione di attività", () => {
  const generated = {
    title: "Ascolto attivo",
    description: "Un percorso breve",
    slides: [
      { type: "content", title: "Benvenuti", body: "Oggi parliamo di ascolto.", options: [], multiple: false, correct_option_index: -1, quiz_mode: "single", accepted_answers: [], explanation: "", scale_max: 5, min_label: "", max_label: "", x_min: "", x_max: "", y_min: "", y_max: "", notes: "Presentati" },
      { type: "quiz", title: "Cos'è l'ascolto attivo?", body: "", options: ["Prestare attenzione", "Interrompere"], multiple: false, correct_option_index: 0, quiz_mode: "single", accepted_answers: [], explanation: "Significa concentrarsi su chi parla.", scale_max: 5, min_label: "", max_label: "", x_min: "", x_max: "", y_min: "", y_max: "", notes: "" },
      { type: "choice", title: "Domanda senza opzioni", body: "", options: [], multiple: false, correct_option_index: -1, quiz_mode: "single", accepted_answers: [], explanation: "", scale_max: 5, min_label: "", max_label: "", x_min: "", x_max: "", y_min: "", y_max: "", notes: "" },
      { type: "scale", title: "Quanto ascolti?", body: "", options: ["A scuola", "A casa"], multiple: false, correct_option_index: -1, quiz_mode: "single", accepted_answers: [], explanation: "", scale_max: 10, min_label: "Poco", max_label: "Molto", x_min: "", x_max: "", y_min: "", y_max: "", notes: "" },
    ],
  };

  it("bozza validata con gli schemi dell'editor; slide non valide scartate; soluzione corretta", async () => {
    GenActivitySchema.parse(generated);
    const { transport, requests } = mockTransport(() => generated);
    const act = await generateActivity(transport, "claude-sonnet-5-5", { topic: "ascolto attivo", audience: "studenti", slideCount: 4 });
    expect(act.slides.map((s) => s.type)).toEqual(["content", "quiz", "scale"]); // choice senza opzioni scartata
    const quiz = act.slides[1]!;
    expect(quiz.type === "quiz" && quiz.correctOptionId).toBe("o1");
    expect(quiz.type === "quiz" && quiz.explanation).toContain("concentrarsi");
    expect(act.settings).toEqual(DEFAULT_SETTINGS);
    expect(requests[0]!.user).toContain("ascolto attivo");
    expect(requests[0]!.user).toContain("studenti");
  });

  it("documento: all'AI va solo il testo del documento", async () => {
    const { transport, requests } = mockTransport(() => generated);
    await generateActivity(transport, "m", { documentText: "Il feedback efficace è specifico e tempestivo.", audience: "docenti", slideCount: 6 });
    expect(requests[0]!.user).toContain("<documento>\nIl feedback efficace è specifico e tempestivo.\n</documento>");
    expect(requests[0]!.user).toContain("docenti");
  });

  it("rifiuto dell'AI propagato come errore gestito", async () => {
    const transport: AiTransport = {
      async structured() {
        throw new AiRefusedError();
      },
    };
    await expect(generateActivity(transport, "m", { topic: "x", audience: "studenti", slideCount: 3 })).rejects.toBeInstanceOf(AiRefusedError);
  });
});

describe("modelli di riserva", () => {
  const req: AiRequest = { model: "claude-sonnet-5-5", system: "s", user: "u", effort: "medium", maxTokens: 100 };
  const chain = ["claude-sonnet-5", "claude-haiku-4-5"];

  it("se il principale declina si passa alle riserve in ordine, con la stessa richiesta", async () => {
    const { transport, requests } = mockTransport((r) => {
      if (r.model !== "claude-haiku-4-5") throw new AiRefusedError();
      return { title: "ok", description: "", slides: [] };
    });
    await withFallbacks(transport, chain).structured(req, GenActivitySchema);
    expect(requests.map((r) => r.model)).toEqual(["claude-sonnet-5-5", "claude-sonnet-5", "claude-haiku-4-5"]);
    for (const r of requests) expect({ ...r, model: "" }).toEqual({ ...req, model: "" });
  });

  it("si ferma al primo modello che risponde; gli errori non recuperabili non passano alle riserve", async () => {
    const ok = mockTransport(() => ({ title: "ok", description: "", slides: [] }));
    await withFallbacks(ok.transport, chain).structured(req, GenActivitySchema);
    expect(ok.requests).toHaveLength(1);

    const bad = mockTransport(() => {
      throw new TypeError("richiesta non valida");
    });
    await expect(withFallbacks(bad.transport, chain).structured(req, GenActivitySchema)).rejects.toBeInstanceOf(TypeError);
    expect(bad.requests).toHaveLength(1);
  });

  it("se tutta la catena declina, l'errore arriva al chiamante", async () => {
    const { transport, requests } = mockTransport(() => {
      throw new AiRefusedError();
    });
    await expect(withFallbacks(transport, chain).structured(req, GenActivitySchema)).rejects.toBeInstanceOf(AiRefusedError);
    expect(requests).toHaveLength(3);
  });
});

describe("documenti elaborati in memoria", () => {
  /** PDF minimale costruito al volo (nessun file su disco). */
  function tinyPdf(text: string): Uint8Array {
    const objs = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
      `<< /Length ${`BT /F1 12 Tf 20 100 Td (${text}) Tj ET`.length} >>\nstream\nBT /F1 12 Tf 20 100 Td (${text}) Tj ET\nendstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];
    let out = "%PDF-1.4\n";
    const offsets: number[] = [];
    objs.forEach((o, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new TextEncoder().encode(out);
  }

  it("PDF: testo estratto senza scrivere file", async () => {
    expect(await extractDocumentText(tinyPdf("Comunicazione efficace in aula"), "application/pdf")).toContain("Comunicazione efficace in aula");
  });
  it("formati non supportati, file vuoti o troppo grandi rifiutati", async () => {
    await expect(extractDocumentText(new Uint8Array([1, 2, 3]), "text/plain")).rejects.toMatchObject({ code: "unsupported" });
    await expect(extractDocumentText(new Uint8Array(11 * 1024 * 1024), "application/pdf")).rejects.toMatchObject({ code: "too_large" });
    await expect(extractDocumentText(new Uint8Array([1, 2, 3]), "application/pdf")).rejects.toBeInstanceOf(DocumentError);
  });
});
