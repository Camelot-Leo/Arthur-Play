import { DEFAULT_SETTINGS } from "@arthur/shared";
import { devices, expect, test, type Browser } from "@playwright/test";
import type { ActivityContent } from "@arthur/shared";
import { createActivity, createFacilitator, loginCookie, trackThirdParty } from "./helpers";

const activity: ActivityContent = {
  title: "Fase 2 in aula",
  settings: DEFAULT_SETTINGS,
  slides: [
    { id: "intro", type: "content", title: "Si parte" },
    {
      id: "quiz1",
      type: "quiz",
      question: "Cosa significa ascolto attivo?",
      mode: "single",
      options: [
        { id: "a", label: "Prestare piena attenzione" },
        { id: "b", label: "Preparare la risposta" },
      ],
      correctOptionId: "a",
      acceptedAnswers: [],
      timerSeconds: 60,
    },
    {
      id: "rank1",
      type: "ranking",
      question: "Ordina per importanza",
      options: [
        { id: "a", label: "Fiducia" },
        { id: "b", label: "Comunicazione" },
        { id: "c", label: "Obiettivi" },
      ],
    },
    {
      id: "pts1",
      type: "points",
      question: "Distribuisci 100 punti",
      options: [
        { id: "a", label: "Tempo" },
        { id: "b", label: "Formazione" },
      ],
    },
    {
      id: "grid1",
      type: "grid",
      question: "Posiziona le attività",
      xAxis: { min: "Facile", max: "Difficile" },
      yAxis: { min: "Poco utile", max: "Molto utile" },
      items: [
        { id: "i1", label: "Riunioni" },
        { id: "i2", label: "Mentoring" },
      ],
    },
    { id: "qa1", type: "qa", question: "Avete domande?" },
  ],
};

async function ctx(browser: Browser, userId?: string, phone = false) {
  const c = await browser.newContext(phone ? { ...devices["Pixel 7"] } : { acceptDownloads: true });
  if (userId) await c.addCookies([await loginCookie(userId)]);
  const offenders = trackThirdParty(c);
  return { page: await c.newPage(), offenders, c };
}

test("Fase 2: quiz, ranking, 100 punti, griglia, Q&A, PNG, timer e font", async ({ browser }) => {
  const user = await createFacilitator();
  await createActivity(user.id, activity);
  const fac = await ctx(browser, user.id);
  await fac.page.goto("/attivita");
  await fac.page.getByRole("button", { name: "Avvia sessione live" }).click();
  await fac.page.waitForURL(/\/regia\//);
  await expect(fac.page.locator("header strong.font-mono")).toHaveText(/\d{3} \d{3}/);
  const code = (await fac.page.locator("header strong.font-mono").textContent())!.replace(/\s/g, "");
  const sid = fac.page.url().split("/regia/")[1]!;

  const proj = await ctx(browser, user.id);
  await proj.page.goto(`/proiezione/${sid}`);

  const p1 = await ctx(browser, undefined, true);
  const p2 = await ctx(browser, undefined, true);
  for (const [p, nick] of [
    [p1, "Lince Agile 11"],
    [p2, "Gufo Felice 22"],
  ] as const) {
    await p.page.goto(`/g/${code}`);
    await p.page.getByLabel("Nickname").fill(nick);
    await p.page.getByRole("button", { name: "Partecipa" }).click();
    await expect(p.page.getByText("Guarda lo schermo")).toBeVisible();
  }

  // Font self-hosted caricati (niente font di sistema)
  await proj.page.evaluate(() => document.fonts.ready);
  expect(await proj.page.evaluate(() => document.fonts.check('600 32px "Clash Display"'))).toBe(true);
  expect(await proj.page.evaluate(() => [...document.fonts].some((f) => f.family.includes("Satoshi") && f.status === "loaded"))).toBe(true);

  // Timer della Regia: durata libera fino a 300 s
  const timerInput = fac.page.getByLabel("Durata in secondi (5–300)");

  // --- Quiz ---
  await fac.page.getByRole("button", { name: "Successiva →" }).click();
  await expect(p1.page.getByRole("timer")).toBeVisible();
  await p1.page.getByText("Prestare piena attenzione").click();
  await p1.page.getByRole("button", { name: "Invia" }).click();
  await expect(p1.page.getByText("Risposta inviata. Attendi la soluzione…")).toBeVisible();
  await p2.page.getByText("Preparare la risposta").click();
  await p2.page.getByRole("button", { name: "Invia" }).click();
  await expect(proj.page.getByText("2 risposte ricevute")).toBeVisible();
  await expect(proj.page.getByText("✓")).toHaveCount(0); // soluzione nascosta finché si risponde
  await expect(timerInput).toBeVisible();
  await timerInput.fill("301");
  await expect(fac.page.getByRole("button", { name: "Avvia timer" })).toBeDisabled();
  await timerInput.fill("300");
  await expect(fac.page.getByRole("button", { name: "Avvia timer" })).toBeEnabled();

  await fac.page.getByRole("button", { name: "Blocca risposte" }).click();
  await expect(p1.page.getByText("Risposta corretta!")).toBeVisible();
  await expect(p1.page.getByText(/^\+\d+ punti$/)).toBeVisible();
  await expect(p2.page.getByText("Risposta non corretta.")).toBeVisible();
  await expect(p2.page.getByText("Soluzione:")).toBeVisible();
  await expect(proj.page.getByText("1 su 2 corrette")).toBeVisible();

  // Download PNG del risultato, generato nel browser
  const dl = fac.page.waitForEvent("download");
  await fac.page.getByRole("button", { name: "Scarica PNG del risultato" }).click();
  const file = await dl;
  expect(file.suggestedFilename()).toBe("risultato-slide-2.png");

  // --- Ranking (pulsanti su/giù) ---
  await fac.page.getByRole("button", { name: "Successiva →" }).click();
  await p1.page.getByRole("button", { name: "Sposta su: Obiettivi" }).click();
  await p1.page.getByRole("button", { name: "Sposta su: Obiettivi" }).click();
  await p1.page.getByRole("button", { name: "Invia" }).click();
  await expect(p1.page.getByText("Risposta inviata")).toBeVisible();
  await expect(proj.page.getByText("posizione media 1")).toBeVisible();

  // --- 100 punti ---
  await fac.page.getByRole("button", { name: "Successiva →" }).click();
  await p1.page.getByRole("spinbutton", { name: "Tempo" }).fill("70");
  await expect(p1.page.getByRole("button", { name: "Invia" })).toBeDisabled();
  await p1.page.getByRole("spinbutton", { name: "Formazione" }).fill("30");
  await expect(p1.page.getByText("Hai distribuito tutti i 100 punti")).toBeVisible();
  await p1.page.getByRole("button", { name: "Invia" }).click();
  await expect(proj.page.getByText("70 punti in media")).toBeVisible();

  // --- Griglia 2x2 (tocco sulla griglia) ---
  await fac.page.getByRole("button", { name: "Successiva →" }).click();
  const grid = p1.page.locator(".aspect-square.touch-none");
  const box = (await grid.boundingBox())!;
  await p1.page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.25);
  await p1.page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.75);
  await expect(p1.page.getByText("2 di 2 elementi posizionati")).toBeVisible();
  await p1.page.getByRole("button", { name: "Invia" }).click();
  await expect(proj.page.getByText("1 risposta")).toBeVisible();

  // --- Q&A ---
  await fac.page.getByRole("button", { name: "Successiva →" }).click();
  await p1.page.getByLabel("Fai una domanda").fill("Come si gestisce un conflitto?");
  await p1.page.getByRole("button", { name: "Invia domanda" }).click();
  await p1.page.getByLabel("Fai una domanda").fill("Che c4zz0 di domanda");
  await p1.page.getByRole("button", { name: "Invia domanda" }).click();
  await expect(p1.page.getByText("Puoi fare ancora 1 domanda")).toBeVisible();
  await p2.page.getByRole("button", { name: "Vota: Come si gestisce un conflitto?" }).click();
  await expect(p2.page.getByRole("button", { name: "Hai votato: Come si gestisce un conflitto?" })).toBeDisabled();
  await expect(proj.page.getByText("Come si gestisce un conflitto?")).toBeVisible();
  await expect(proj.page.getByText(/c4zz0/)).toHaveCount(0);
  await expect(p2.page.getByText(/c4zz0/)).toHaveCount(0);
  await fac.page.getByRole("button", { name: "Segna come risposta: Come si gestisce un conflitto?" }).click();
  await expect(proj.page.getByText("Risposta data")).toBeVisible();

  for (const x of [fac, proj, p1, p2]) expect(x.offenders).toEqual([]);
  for (const x of [fac, proj, p1, p2]) await x.c.close();
});
