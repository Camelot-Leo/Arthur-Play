import { devices, expect, test, type Browser } from "@playwright/test";
import { DEFAULT_SETTINGS, type ActivityContent } from "@arthur/shared";
import { createActivity, createFacilitator, loginCookie, trackThirdParty } from "./helpers";

const quiz = (id: string, question: string) => ({
  id,
  type: "quiz" as const,
  question,
  mode: "single" as const,
  options: [
    { id: "a", label: "Giusta" },
    { id: "b", label: "Sbagliata" },
  ],
  correctOptionId: "a",
  acceptedAnswers: [],
  timerSeconds: null,
});

const activity: ActivityContent = {
  title: "Fase 3 in aula",
  settings: {
    ...DEFAULT_SETTINGS,
    teams: { enabled: true, mode: "choice", names: ["Leoni", "Aquile"] },
    mission: { enabled: true, type: "correct", target: 50, label: "Almeno metà giuste!" },
  },
  slides: [{ id: "intro", type: "content", title: "Si gioca" }, quiz("q1", "Prima domanda")],
};

async function ctx(browser: Browser, opts: { userId?: string; phone?: boolean; reducedMotion?: boolean } = {}) {
  const c = await browser.newContext({ ...(opts.phone ? devices["Pixel 7"] : {}), reducedMotion: opts.reducedMotion ? "reduce" : "no-preference" });
  if (opts.userId) await c.addCookies([await loginCookie(opts.userId)]);
  const offenders = trackThirdParty(c);
  return { page: await c.newPage(), offenders, c };
}

test("Fase 3: squadre scelte, missione collettiva, classifica e podio di squadra", async ({ browser }) => {
  const user = await createFacilitator();
  await createActivity(user.id, activity);
  const fac = await ctx(browser, { userId: user.id });
  await fac.page.goto("/attivita");
  await fac.page.getByRole("button", { name: "Avvia sessione live" }).click();
  await fac.page.waitForURL(/\/regia\//);
  await expect(fac.page.locator("header strong.font-mono")).toHaveText(/\d{3} \d{3}/);
  const code = (await fac.page.locator("header strong.font-mono").textContent())!.replace(/\s/g, "");
  const sid = fac.page.url().split("/regia/")[1]!;

  const proj = await ctx(browser, { userId: user.id });
  await proj.page.goto(`/proiezione/${sid}`);
  await expect(proj.page.getByText("Almeno metà giuste!")).toBeVisible();
  await expect(proj.page.getByRole("button", { name: /Attiva i suoni/ })).toBeVisible();

  const phones = [];
  for (const [nick, team] of [
    ["Leone Veloce 10", "Leoni"],
    ["Aquila Agile 20", "Aquile"],
  ] as const) {
    const p = await ctx(browser, { phone: true });
    await p.page.goto(`/g/${code}`);
    await p.page.getByLabel("Nickname").fill(nick);
    await p.page.getByRole("button", { name: "Partecipa" }).click();
    await expect(p.page.getByRole("heading", { name: "Scegli la tua squadra" })).toBeVisible();
    // I colori delle squadre sono davvero applicati (Leoni = rosso, Aquile = blu)
    expect(await p.page.getByRole("button", { name: "Leoni" }).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 58, 32)");
    expect(await p.page.getByRole("button", { name: "Aquile" }).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(31, 91, 255)");
    await p.page.getByRole("button", { name: team }).click();
    await expect(p.page.getByText("Guarda lo schermo")).toBeVisible();
    await expect(p.page.locator("header").getByText(team)).toBeVisible();
    await expect(p.page.getByRole("progressbar", { name: "Missione della classe" })).toBeVisible();
    phones.push(p);
  }

  // Quiz: una giusta e una sbagliata → 50% → missione compiuta a risposte chiuse
  await fac.page.getByRole("button", { name: "Successiva →" }).click();
  await phones[0]!.page.getByText("Giusta").click();
  await phones[0]!.page.getByRole("button", { name: "Invia" }).click();
  await phones[1]!.page.getByText("Sbagliata").click();
  await phones[1]!.page.getByRole("button", { name: "Invia" }).click();
  await expect(proj.page.getByText("0% di risposte corrette", { exact: true })).toBeVisible(); // nessuna anticipazione
  await fac.page.getByRole("button", { name: "Blocca risposte" }).click();
  await expect(proj.page.getByText("50% di risposte corrette", { exact: true })).toBeVisible();
  await expect(proj.page.getByRole("status").getByText("Missione compiuta!")).toBeVisible();
  await expect(phones[1]!.page.getByText("Missione compiuta!")).toBeVisible();

  // Classifica solo tra squadre
  await fac.page.getByRole("button", { name: "Mostra la classifica" }).click();
  await expect(proj.page.getByRole("heading", { name: "Classifica delle squadre" })).toBeVisible();
  await expect(proj.page.getByText("1000 punti")).toBeVisible();
  await expect(proj.page.getByText("Leone Veloce 10")).toHaveCount(0); // nessun nickname in classifica di squadra
  await expect(phones[0]!.page.getByText("Leoni è al 1° posto")).toBeVisible();
  await expect(phones[1]!.page.getByText("Aquile è al 2° posto")).toBeVisible();

  // Podio finale
  await fac.page.getByRole("button", { name: /Mostra il podio finale/ }).click();
  await expect(proj.page.getByRole("heading", { name: /Podio finale/ })).toBeVisible();

  // Suoni disattivabili dalla Regia: il pulsante in Proiezione scompare
  await fac.page.getByLabel("Suoni in Proiezione").click();
  await expect(fac.page.getByLabel("Suoni in Proiezione")).not.toBeChecked();
  await expect(proj.page.getByRole("button", { name: /Attiva i suoni/ })).toHaveCount(0);

  for (const x of [fac, proj, ...phones]) expect(x.offenders).toEqual([]);
  for (const x of [fac, proj, ...phones]) await x.c.close();
});

test("animazioni: prefers-reduced-motion le annulla", async ({ browser }) => {
  const p = await ctx(browser, { reducedMotion: true });
  await p.page.goto("/privacy");
  const duration = await p.page.evaluate(() => {
    const el = document.createElement("div");
    el.className = "podium-rise";
    document.body.appendChild(el);
    return parseFloat(getComputedStyle(el).animationDuration);
  });
  expect(duration).toBeLessThan(0.01);
  await p.c.close();
});
