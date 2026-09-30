/**
 * Test di carico: N partecipanti simulati (default 300) su una sessione live.
 * Avvia un'istanza del servizio realtime come processo separato, poi misura:
 * - tempo di ingresso di tutti i partecipanti;
 * - latenza tra invio della risposta e comparsa del conteggio in Proiezione.
 * Esito positivo se il 100% delle risposte compare in Proiezione entro 1 secondo.
 *
 * Con `--teams N` (N ≥ 2) attiva la modalità Squadre con assegnazione automatica, aggiunge un
 * quiz e verifica anche il bilanciamento delle squadre e l'aggiornamento della classifica.
 *
 * Uso: pnpm load [-- --participants 300] [-- --teams 4]
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { io, type Socket } from "socket.io-client";
import { EV, REALTIME_PATH, type ActivityContent, DEFAULT_SETTINGS } from "@arthur/shared";
import { closeSession, createRedis, createSession, sessionKeys, signTicket } from "@arthur/shared/server";

const arg = (name: string, def: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
};
const N = arg("participants", 300);
const TEAMS = arg("teams", 0);
const PORT = arg("port", 4300);
const SECRET = "load-test-secret-load-test-secret-123456";
const REDIS_URL = process.env.LOAD_REDIS_URL ?? "redis://127.0.0.1:6379/13";
const URL_RT = `http://127.0.0.1:${PORT}`;

const activity: ActivityContent = {
  title: "Test di carico",
  settings:
    TEAMS >= 2
      ? {
          ...DEFAULT_SETTINGS,
          teams: { enabled: true, mode: "auto", names: Array.from({ length: TEAMS }, (_, i) => `Squadra ${i + 1}`) },
          mission: { enabled: true, type: "correct", target: 60 },
        }
      : DEFAULT_SETTINGS,
  slides: [
    { id: "intro", type: "content", title: "Benvenuti" },
    {
      id: "q1",
      type: "choice",
      question: "Scelta",
      multiple: false,
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
        { id: "c", label: "C" },
      ],
    },
    { id: "q2", type: "open", question: "Aperta", maxAnswers: 1 },
    { id: "q3", type: "wordcloud", question: "Parole", maxEntries: 3 },
    {
      id: "q4",
      type: "quiz",
      question: "Quiz",
      mode: "single",
      options: [
        { id: "a", label: "Giusta" },
        { id: "b", label: "Sbagliata" },
      ],
      correctOptionId: "a",
      acceptedAnswers: [],
      timerSeconds: 60,
    },
  ],
};

const connect = (auth: object): Socket =>
  io(URL_RT, { path: REALTIME_PATH, auth, transports: ["websocket"], forceNew: true, reconnection: false });
const connected = (s: Socket) =>
  new Promise<void>((res, rej) => {
    s.once("connect", () => res());
    s.once("connect_error", rej);
  });
const ack = <T = any>(s: Socket, ev: string, p?: unknown) => s.timeout(15_000).emitWithAck(ev, p) as Promise<T>;
const pct = (arr: number[], p: number) => arr.slice().sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))] ?? 0;

async function waitHealth() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${URL_RT}/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("servizio realtime non avviato");
}

async function round(label: string, ctrl: Socket, proj: Socket, participants: Socket[], index: number, slideId: string, answer: (i: number) => unknown) {
  await ack(ctrl, EV.goto, { index });
  await new Promise((r) => setTimeout(r, 300));
  const seen: number[] = []; // seen[k] = istante in cui la Proiezione mostra ≥ k risposte
  const onResults = (m: any) => {
    if (m?.slideId !== slideId || !m.data) return;
    const n = m.data.respondents as number;
    for (let k = seen.length; k <= n; k++) seen[k] = Date.now();
  };
  proj.on(EV.results, onResults);
  const sentAt: number[] = [];
  const ackOrder: number[] = [];
  const t0 = Date.now();
  await Promise.all(
    participants.map(async (p, i) => {
      sentAt[i] = Date.now();
      const r = await ack(p, EV.answer, { slideId, answer: answer(i) });
      if (!r.ok) throw new Error(`${label}: risposta rifiutata (${r.error})`);
      ackOrder.push(i);
    }),
  );
  const ackedAll = Date.now() - t0;
  const deadline = Date.now() + 5000;
  while ((seen.length - 1 < participants.length) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
  proj.off(EV.results, onResults);
  // Latenza della k-esima risposta registrata = comparsa di "≥ k" in Proiezione − suo invio.
  const lat = ackOrder.map((i, k) => (seen[k + 1] ?? Infinity) - sentAt[i]!);
  const res = { label, answers: participants.length, ackedAllMs: ackedAll, p50: pct(lat, 50), p95: pct(lat, 95), max: Math.max(...lat) };
  console.log(`${label}: ${res.answers} risposte, tutte confermate in ${res.ackedAllMs} ms · latenza Proiezione p50 ${res.p50} ms, p95 ${res.p95} ms, max ${res.max} ms`);
  return res;
}

async function main() {
  const child = spawn("pnpm", ["--filter", "@arthur/realtime", "exec", "tsx", "src/main.ts"], {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    env: { ...process.env, REALTIME_PORT: String(PORT), REDIS_URL, REALTIME_SECRET: SECRET, WEB_ORIGIN: "http://localhost:3000", LOG_LEVEL: "warn" },
    stdio: ["ignore", "inherit", "inherit"],
  });
  const redis = createRedis(REDIS_URL);
  let failed = false;
  try {
    await waitHealth();
    const { sid, code } = await createSession(redis, { ownerId: "load", activity });
    const ctrl = connect({ role: "control", ticket: await signTicket(SECRET, { sid, uid: "load", role: "control" }) });
    const proj = connect({ role: "projection", ticket: await signTicket(SECRET, { sid, uid: "load", role: "projection" }) });
    await Promise.all([connected(ctrl), connected(proj)]);
    await Promise.all([ack(ctrl, EV.init), ack(proj, EV.init)]);

    const tJoin = Date.now();
    const participants: Socket[] = [];
    const teamOf = new Map<Socket, string>();
    const batch = 50;
    for (let b = 0; b < N; b += batch) {
      await Promise.all(
        Array.from({ length: Math.min(batch, N - b) }, async (_, j) => {
          const s = connect({ role: "participant", code });
          await connected(s);
          const r = await ack(s, EV.join, { nickname: `Partecipante ${b + j + 1}` });
          if (!r.ok) throw new Error(`ingresso rifiutato: ${r.error}`);
          if (r.team) teamOf.set(s, r.team);
          participants.push(s);
        }),
      );
    }
    console.log(`Ingresso di ${N} partecipanti completato in ${Date.now() - tJoin} ms`);

    const results = [
      await round("Scelta multipla", ctrl, proj, participants, 1, "q1", (i) => ({ optionIds: [["a", "b", "c"][i % 3]] })),
      await round("Risposta aperta", ctrl, proj, participants, 2, "q2", (i) => ({ text: `Risposta numero ${i} sul lavoro di squadra` })),
      await round("Word cloud", ctrl, proj, participants, 3, "q3", (i) => ({ words: [`parola${i % 40}`, "fiducia"] })),
    ];
    results.push(await round("Quiz a punti", ctrl, proj, participants, 4, "q4", (i) => ({ optionId: i % 3 === 0 ? "b" : "a" })));
    failed = results.some((r) => r.max > 1000);

    if (TEAMS >= 2) {
      const counts: Record<string, number> = {};
      for (const t of teamOf.values()) counts[t] = (counts[t] ?? 0) + 1;
      const values = Object.values(counts);
      const spread = Math.max(...values) - Math.min(...values);
      console.log(`Squadre: ${Object.keys(counts).length} squadre, membri ${values.join(" / ")} (differenza massima ${spread})`);
      if (Object.keys(counts).length !== TEAMS || spread > 1) failed = true;
      // Classifica di squadra aggiornata con i punti del quiz
      const board = new Promise<any>((resolve) => ctrl.on(EV.board, (b: any) => b.teams?.every((t: any) => t.total > 0) && resolve(b)));
      await ack(ctrl, EV.lock, { locked: true });
      const b = await Promise.race([board, new Promise((r) => setTimeout(() => r(null), 3000))]);
      if (!b) {
        console.error("Classifica di squadra non ricevuta");
        failed = true;
      } else console.log(`Classifica: ${(b as any).teams.map((t: any) => `${t.name} ${t.score}`).join(", ")}`);
    }

    for (const s of participants) s.disconnect();
    ctrl.disconnect();
    proj.disconnect();
    await closeSession(redis, sid);
    const left = await sessionKeys(redis, sid);
    if (left.length) {
      console.error(`Chiavi residue dopo la chiusura: ${left.length}`);
      failed = true;
    }
    console.log(failed ? "ESITO: NON SUPERATO" : "ESITO: SUPERATO (tutte le risposte in Proiezione entro 1 secondo)");
  } finally {
    await redis.quit();
    child.kill("SIGTERM");
  }
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
