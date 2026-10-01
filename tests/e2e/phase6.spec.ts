import { readFile } from "node:fs/promises";
import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { T } from "@arthur/shared";
import { activitiesOf, createActivity, createFacilitator, createTerm, findTerm, findTermById, findUser, getActivityRow, loginCookie, sampleActivity, trackThirdParty } from "./helpers";

/**
 * Fase 6: editor con anteprima dal vivo, libreria personale e condivisa, duplica/esporta/importa,
 * pannello admin. Criterio: un facilitatore non può modificare attività altrui né la libreria condivisa.
 */
const ORIGIN = { origin: "http://localhost:3000" };

async function loggedIn(context: BrowserContext, role: "facilitator" | "admin" = "facilitator") {
  const user = await createFacilitator(role);
  await context.addCookies([await loginCookie(user.id)]);
  return user;
}

const put = (req: APIRequestContext, id: string, title: string) =>
  req.put(`/api/attivita/${id}`, { headers: ORIGIN, data: { content: { ...sampleActivity, title }, meta: { audience: "studenti", tags: [] } } });

test("permessi: un facilitatore non modifica attività altrui né la libreria condivisa", async ({ browser }) => {
  const annaCtx = await browser.newContext();
  const brunoCtx = await browser.newContext();
  const anna = await loggedIn(annaCtx);
  const bruno = await loggedIn(brunoCtx);
  const admin = await createFacilitator("admin");
  const annaAct = await createActivity(anna.id, { ...sampleActivity, title: "Attività di Anna" });
  const sharedAct = await createActivity(admin.id, { ...sampleActivity, title: "Attività condivisa" }, { library: "shared", tags: ["comunicazione"] });
  const req = brunoCtx.request;

  // Attività personale di un altro facilitatore: invisibile e non modificabile.
  expect((await req.get(`/api/attivita/${annaAct}`)).status()).toBe(404);
  expect((await put(req, annaAct, "Modificata da Bruno")).status()).toBe(404);
  expect((await req.post(`/api/attivita/${annaAct}/duplica`, { headers: ORIGIN })).status()).toBe(404);
  expect((await req.get(`/api/attivita/${annaAct}/esporta`)).status()).toBe(404);
  expect((await req.post("/api/sessioni", { headers: ORIGIN, data: { activityId: annaAct } })).status()).toBe(404);
  expect((await req.post(`/api/attivita/${annaAct}/libreria`, { headers: ORIGIN, data: { library: "shared" } })).status()).toBe(403);
  const page = await brunoCtx.newPage();
  expect((await page.goto(`/attivita/${annaAct}`))?.status()).toBe(404);

  // Libreria condivisa: visibile, ma non modificabile né curabile da un facilitatore.
  expect((await req.get(`/api/attivita/${sharedAct}`)).status()).toBe(200);
  expect((await put(req, sharedAct, "Modificata da Bruno")).status()).toBe(403);
  expect((await req.post(`/api/attivita/${sharedAct}/libreria`, { headers: ORIGIN, data: { library: "personal" } })).status()).toBe(403);
  expect((await page.goto(`/attivita/${sharedAct}`))?.status()).toBe(404);

  // Pannello e API dell'admin: inesistenti per il facilitatore.
  expect((await page.goto("/admin"))?.status()).toBe(404);
  expect((await req.post("/api/admin/inviti", { headers: ORIGIN, data: { name: "X", email: "x@example.it" } })).status()).toBe(403);
  expect((await req.post("/api/admin/moderazione", { headers: ORIGIN, data: { lang: "it", term: "provaxyz", match: "word" } })).status()).toBe(403);
  const term = await createTerm(`protetto${Date.now()}`);
  expect((await req.delete(`/api/admin/moderazione/${term}`, { headers: ORIGIN })).status()).toBe(403);

  // Il proprietario può modificare la propria; nulla è cambiato per gli altri tentativi.
  expect((await put(annaCtx.request, annaAct, "Anna aggiornata")).status()).toBe(200);
  expect((await getActivityRow(annaAct))?.title).toBe("Anna aggiornata");
  expect((await getActivityRow(sharedAct))?.title).toBe("Attività condivisa");
  expect((await getActivityRow(sharedAct))?.library).toBe("shared");
  expect(await findTerm("provaxyz")).toBeNull();
  expect(await findTermById(term)).not.toBeNull();
  expect(await findUser("x@example.it")).toBeNull();

  // Dalla libreria condivisa si può duplicare (copia personale) e avviare una sessione.
  const dup = await req.post(`/api/attivita/${sharedAct}/duplica`, { headers: ORIGIN });
  expect(dup.status()).toBe(200);
  const copy = await getActivityRow((await dup.json()).id);
  expect(copy?.ownerId).toBe(bruno.id);
  expect(copy?.library).toBe("personal");
  expect(copy?.title).toBe(`Attività condivisa${T.activities.copySuffix}`);
  expect(copy?.tags).toEqual(["comunicazione"]);
  expect((await req.post("/api/sessioni", { headers: ORIGIN, data: { activityId: sharedAct } })).status()).toBe(200);

  await annaCtx.close();
  await brunoCtx.close();
});

test("admin: pubblica e ritira dalla libreria condivisa; il facilitatore la vede e la filtra", async ({ browser }) => {
  const adminCtx = await browser.newContext();
  const facCtx = await browser.newContext();
  const admin = await loggedIn(adminCtx, "admin");
  await loggedIn(facCtx);
  const title = `Libreria ${Date.now()}`;
  const id = await createActivity(admin.id, { ...sampleActivity, title }, { audience: "docenti", tags: ["orientamento"] });

  const ap = await adminCtx.newPage();
  await ap.goto("/attivita");
  const card = ap.getByRole("listitem").filter({ hasText: title });
  await card.getByRole("button", { name: T.activities.share }).click();
  await expect(card).toHaveCount(0);
  expect((await getActivityRow(id))?.library).toBe("shared");

  const fp = await facCtx.newPage();
  await fp.goto("/attivita?libreria=condivisa");
  const shared = fp.getByRole("listitem").filter({ hasText: title });
  await expect(shared).toBeVisible();
  await expect(shared.getByRole("link", { name: T.activities.edit })).toHaveCount(0);
  await expect(shared.getByRole("button", { name: T.activities.unshare })).toHaveCount(0);
  // Filtri per destinatari e tag di percorso.
  await fp.getByLabel(T.activities.filterAudience).selectOption("studenti");
  await fp.getByRole("button", { name: T.activities.applyFilters }).click();
  await expect(fp.getByRole("listitem").filter({ hasText: title })).toHaveCount(0);
  await fp.getByLabel(T.activities.filterAudience).selectOption("docenti");
  await fp.getByLabel(T.activities.filterTag).selectOption("orientamento");
  await fp.getByRole("button", { name: T.activities.applyFilters }).click();
  await expect(fp.getByRole("listitem").filter({ hasText: title })).toBeVisible();

  // L'admin modifica la condivisa e poi la ritira.
  await ap.goto("/attivita?libreria=condivisa");
  const sharedCard = ap.getByRole("listitem").filter({ hasText: title });
  await expect(sharedCard.getByRole("link", { name: T.activities.edit })).toBeVisible();
  await sharedCard.getByRole("button", { name: T.activities.unshare }).click();
  await expect(sharedCard).toHaveCount(0);
  expect((await getActivityRow(id))?.library).toBe("personal");

  await adminCtx.close();
  await facCtx.close();
});

test("editor: anteprima dal vivo di Proiezione e Partecipante, destinatari e tag", async ({ context, page }) => {
  const user = await loggedIn(context);
  const offenders = trackThirdParty(page);
  const id = await createActivity(user.id, sampleActivity);
  await page.goto(`/attivita/${id}`);

  const preview = page.locator("aside");
  // Selezione della slide 2 (scelta multipla) e modifica della domanda: l'anteprima si aggiorna.
  const slide2 = page.getByRole("listitem").filter({ hasText: T.editor.slideN(2) });
  await slide2.getByRole("button", { name: T.editor.previewSelect }).click();
  await slide2.getByLabel(T.editor.question).fill("Quanto ascolti davvero?");
  await expect(preview.getByText("Quanto ascolti davvero?")).toHaveCount(2); // Proiezione e telefono
  await slide2.getByRole("button", { name: T.editor.addOption }).click();
  await slide2.getByRole("textbox", { name: T.editor.option(3) }).fill("Dipende");
  await expect(preview.getByText("Dipende")).toHaveCount(1); // solo sul telefono (la Proiezione mostra i risultati)
  await expect(preview.getByText(T.editor.previewResults)).toBeVisible();

  // Slide di contenuto: titolo e testo in entrambe le viste.
  const slide1 = page.getByRole("listitem").filter({ hasText: T.editor.slideN(1) });
  await slide1.getByLabel(T.editor.body).fill("Testo in anteprima");
  await expect(preview.getByText("Testo in anteprima")).toHaveCount(2);

  // Metadati della libreria salvati con l'attività.
  await page.getByLabel(T.activities.audience.entrambi).check();
  await page.getByLabel(T.editor.tags).fill("Comunicazione, ascolto, comunicazione");
  await page.getByRole("button", { name: T.editor.save }).click();
  await expect(page.getByText(T.editor.saved)).toBeVisible();
  const row = await getActivityRow(id);
  expect(row?.audience).toBe("entrambi");
  expect(row?.tags).toEqual(["comunicazione", "ascolto"]);
  expect(row?.slides[1]).toMatchObject({ question: "Quanto ascolti davvero?" });
  expect(offenders).toEqual([]);
});

test("esporta e importa un'attività come JSON (solo contenuto)", async ({ context, page }) => {
  const user = await loggedIn(context);
  const title = `Esporta ${Date.now()}`;
  const id = await createActivity(user.id, { ...sampleActivity, title }, { audience: "docenti", tags: ["squadra"] });
  await page.goto("/attivita");
  const card = page.getByRole("listitem").filter({ hasText: title });
  const download = page.waitForEvent("download");
  await card.getByRole("link", { name: T.activities.exportJson }).click();
  const file = await (await download).path();
  const json = JSON.parse(await readFile(file, "utf8"));
  expect(json.formato).toBe("arthur-play/attivita");
  expect(Object.keys(json.attivita).sort()).toEqual(["audience", "settings", "slides", "tags", "title"]);
  expect(JSON.stringify(json)).not.toContain(user.id);
  expect(JSON.stringify(json)).not.toContain(id);

  // Importazione dello stesso file: nuova attività personale, con contenuto identico.
  const before = (await activitiesOf(user.id)).length;
  await page.getByLabel(T.activities.importJson).setInputFiles(file);
  await page.waitForURL(/\/attivita\/[0-9a-f-]{36}$/);
  const imported = await getActivityRow(page.url().split("/").pop()!);
  expect(imported?.id).not.toBe(id);
  expect(imported?.ownerId).toBe(user.id);
  expect(imported?.library).toBe("personal");
  expect(imported?.slides).toEqual(sampleActivity.slides);
  expect(imported?.tags).toEqual(["squadra"]);
  expect((await activitiesOf(user.id)).length).toBe(before + 1);

  // File non valido: messaggio in italiano, nessuna attività creata.
  await page.goto("/attivita");
  await page.getByLabel(T.activities.importJson).setInputFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from('{"formato":"altro"}') });
  await expect(page.getByText(T.activities.importError)).toBeVisible();
  expect((await activitiesOf(user.id)).length).toBe(before + 1);
});

test("admin: invito di un facilitatore e liste di moderazione", async ({ context, page }) => {
  await loggedIn(context, "admin");
  await page.goto("/attivita");
  await page.getByRole("link", { name: T.activities.admin }).click();
  await expect(page.getByRole("heading", { name: T.admin.title, level: 1 })).toBeVisible();

  const email = `invitato-${Date.now()}@example.it`;
  await page.getByLabel(T.admin.name).fill("Nuovo Facilitatore");
  await page.getByLabel(T.admin.email).fill(email);
  await page.getByRole("button", { name: T.admin.invite }).click();
  await expect(page.getByText(T.admin.invited(email))).toBeVisible();
  const invited = await findUser(email);
  expect(invited?.role).toBe("facilitator");
  expect(invited?.tokens).toHaveLength(1);
  expect(invited?.tokens[0]?.purpose).toBe("invite");
  expect(invited!.tokens[0]!.expiresAt.getTime() - Date.now()).toBeGreaterThan(6.9 * 86_400_000);
  // Stessa email: rifiutata.
  await page.getByLabel(T.admin.name).fill("Doppione");
  await page.getByLabel(T.admin.email).fill(email);
  await page.getByRole("button", { name: T.admin.invite }).click();
  await expect(page.getByText(T.admin.exists)).toBeVisible();

  const term = `termine${Date.now()}`;
  await page.getByLabel(`${T.admin.term} (${T.admin.langs.it})`).fill(term);
  await page.getByRole("button", { name: T.admin.addTerm }).click();
  await expect(page.getByRole("button", { name: T.admin.removeTerm(term) })).toBeVisible();
  expect(await findTerm(term)).toMatchObject({ lang: "it", match: "contains" });
  await page.getByRole("button", { name: T.admin.removeTerm(term) }).click();
  await expect(page.getByRole("button", { name: T.admin.removeTerm(term) })).toHaveCount(0);
  await expect.poll(() => findTerm(term)).toBeNull();
});
