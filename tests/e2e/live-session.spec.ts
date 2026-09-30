import { devices, expect, test, type Browser, type Page } from "@playwright/test";
import { closeDb, createActivity, createFacilitator, createLoginToken, loginCookie, sampleActivity, trackThirdParty } from "./helpers";

test.afterAll(async () => {
  await closeDb();
});

async function facilitatorPage(browser: Browser, userId: string) {
  const ctx = await browser.newContext();
  await ctx.addCookies([await loginCookie(userId)]);
  const offenders = trackThirdParty(ctx);
  return { page: await ctx.newPage(), offenders, ctx };
}

async function phonePage(browser: Browser) {
  const ctx = await browser.newContext({ ...devices["Pixel 7"] });
  const offenders = trackThirdParty(ctx);
  return { page: await ctx.newPage(), offenders, ctx };
}

async function startSession(page: Page) {
  await page.goto("/attivita");
  await page.getByRole("button", { name: "Avvia sessione live" }).first().click();
  await page.waitForURL(/\/regia\//);
  await expect(page.locator("header strong.font-mono")).toHaveText(/\d{3} \d{3}/);
  const code = (await page.locator("header strong.font-mono").textContent())!.replace(/\s/g, "");
  return { code, sid: page.url().split("/regia/")[1]! };
}

test("magic link: il facilitatore accede confermando il link", async ({ page }) => {
  const user = await createFacilitator();
  const token = await createLoginToken(user.id);
  await page.goto(`/login/verifica?t=${token}`);
  await page.getByRole("button", { name: "Accedi" }).click();
  await page.waitForURL("**/attivita");
  await expect(page.getByRole("heading", { name: "Le mie attività" })).toBeVisible();
  // Il link è monouso
  await page.context().clearCookies();
  await page.goto(`/login/verifica?t=${token}`);
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page.getByText("Il link non è valido o è scaduto")).toBeVisible();
});

test("sessione live completa: ingresso da smartphone, risultati in tempo reale, moderazione, nessun dominio terzo", async ({ browser }) => {
  const user = await createFacilitator();
  await createActivity(user.id, sampleActivity);

  const fac = await facilitatorPage(browser, user.id);
  const { code, sid } = await startSession(fac.page);

  const proj = await facilitatorPage(browser, user.id);
  await proj.page.goto(`/proiezione/${sid}`);
  await expect(proj.page.getByText(code.slice(0, 3) + " " + code.slice(3))).toBeVisible();
  await expect(proj.page.getByRole("img", { name: /Codice QR per entrare/ })).toBeVisible();

  // --- Ingresso partecipante da smartphone: codice + nickname generato, senza account ---
  const phone = await phonePage(browser);
  const t0 = Date.now();
  await phone.page.goto("/");
  await phone.page.getByLabel("Codice a 6 cifre").fill(code);
  await phone.page.getByRole("button", { name: "Entra" }).click();
  await phone.page.getByRole("button", { name: /Genera nickname/ }).click();
  await expect(phone.page.getByLabel("Nickname")).not.toHaveValue("");
  await phone.page.getByRole("button", { name: "Partecipa" }).click();
  await expect(phone.page.getByText("Guarda lo schermo")).toBeVisible();
  expect(Date.now() - t0).toBeLessThan(15_000);
  await expect(proj.page.getByText("1 partecipante")).toBeVisible();
  await expect(phone.page.getByRole("link", { name: "Privacy e cookie" })).toBeVisible();

  // --- Link diretto con codice precompilato (come dal QR) ---
  const phone2 = await phonePage(browser);
  await phone2.page.goto(`/g/${code}`);
  await phone2.page.getByLabel("Nickname").fill("Volpe Gentile 42");
  await phone2.page.getByRole("button", { name: "Partecipa" }).click();
  await expect(phone2.page.getByText("Sei Volpe Gentile 42")).toBeVisible();

  // --- Scelta multipla: risultato in Proiezione entro 1 secondo ---
  await fac.page.getByRole("button", { name: "Successiva →" }).click();
  await expect(phone.page.getByRole("heading", { name: "Quanto ascolti gli altri?" })).toBeVisible();
  await phone.page.getByText("Molto").click();
  const sent = Date.now();
  await phone.page.getByRole("button", { name: "Invia" }).click();
  await expect(proj.page.getByText("1 risposta")).toBeVisible({ timeout: 1000 });
  expect(Date.now() - sent).toBeLessThan(1000);
  await expect(phone.page.getByText("Risposta inviata")).toBeVisible();

  // --- Risposta aperta: il testo filtrato non appare mai in Proiezione ---
  await fac.page.getByRole("button", { name: "Successiva →" }).click();
  await phone.page.getByLabel("La tua risposta").fill("Che c4zz4t4 di domanda");
  await phone.page.getByRole("button", { name: "Invia" }).click();
  await expect(phone.page.getByText(/Puoi inviare ancora 1 risposta/)).toBeVisible();
  await phone2.page.getByLabel("La tua risposta").fill("La fiducia reciproca");
  await phone2.page.getByRole("button", { name: "Invia" }).click();
  await expect(proj.page.getByText("La fiducia reciproca")).toBeVisible({ timeout: 1000 });
  await expect(fac.page.getByText("1 risposta filtrata")).toBeVisible();
  await expect(proj.page.getByText(/c4zz4t4/)).toHaveCount(0);

  // --- Il facilitatore nasconde una risposta con un tocco ---
  await fac.page.getByRole("button", { name: "Nascondi dalla Proiezione: La fiducia reciproca" }).click();
  await expect(proj.page.getByText("La fiducia reciproca")).toHaveCount(0);

  // --- Word cloud ---
  await fac.page.getByRole("button", { name: "Successiva →" }).click();
  await phone.page.getByLabel("Parola 1").fill("Rispetto");
  await phone.page.getByLabel("Parola 2").fill("m.e.r.d.a");
  await phone.page.getByRole("button", { name: "Invia" }).click();
  await expect(proj.page.getByText("rispetto", { exact: false }).first()).toBeVisible({ timeout: 1000 });
  await expect(proj.page.getByText(/merda|m\.e\.r\.d\.a/i)).toHaveCount(0);

  // --- Riconnessione: ricarico la pagina del telefono e resto nella sessione ---
  await phone.page.reload();
  await expect(phone.page.getByRole("heading", { name: "Una parola sulla fiducia" })).toBeVisible();
  await expect(phone.page.getByText("Risposta inviata")).toBeVisible();

  // --- Chiusura: i partecipanti vedono la fine, la Regia conferma la cancellazione ---
  fac.page.once("dialog", (d) => d.accept());
  await fac.page.getByRole("button", { name: "Chiudi sessione" }).click();
  await expect(fac.page.getByText("Sessione chiusa")).toBeVisible();
  await expect(phone.page.getByText("L'attività è terminata")).toBeVisible();

  // --- Nessuna richiesta verso domini terzi da nessuna vista ---
  expect(phone.offenders).toEqual([]);
  expect(phone2.offenders).toEqual([]);
  expect(proj.offenders).toEqual([]);
  expect(fac.offenders).toEqual([]);

  for (const c of [fac.ctx, proj.ctx, phone.ctx, phone2.ctx]) await c.close();
});

test("pagine pubbliche: nessuna richiesta verso domini terzi, link Privacy presente", async ({ page }) => {
  const offenders = trackThirdParty(page);
  for (const path of ["/", "/privacy", "/login", "/g/123456"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Privacy e cookie" })).toBeVisible();
  await page.goto("/g/123456");
  await expect(page.getByText("Nessuna attività attiva con questo codice.")).toBeVisible();
  expect(offenders).toEqual([]);
});
