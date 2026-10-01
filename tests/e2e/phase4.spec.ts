import { devices, expect, test, type Browser } from "@playwright/test";
import { DEFAULT_SETTINGS, type ActivityContent } from "@arthur/shared";
import { createActivity, createFacilitator, loginCookie, trackThirdParty } from "./helpers";

const activity: ActivityContent = {
  title: "Compito a casa: ascolto",
  settings: DEFAULT_SETTINGS,
  slides: [
    { id: "intro", type: "content", title: "Benvenuti", body: "Rispondi con calma." },
    {
      id: "c1",
      type: "choice",
      question: "Quanto ascolti gli altri?",
      multiple: false,
      options: [
        { id: "a", label: "Molto" },
        { id: "b", label: "Poco" },
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
      explanation: "Significa concentrarsi su chi parla, senza preparare la risposta.",
    },
  ],
};

const localInput = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

async function ctx(browser: Browser, userId?: string, phone = false) {
  const c = await browser.newContext(phone ? { ...devices["Pixel 7"] } : {});
  if (userId) await c.addCookies([await loginCookie(userId)]);
  const offenders = trackThirdParty(c);
  return { page: await c.newPage(), offenders, c };
}

test("Fase 4: ritmo libero con scadenza, risultati aggregati, feedback immediato, niente doppi invii", async ({ browser }) => {
  const user = await createFacilitator();
  await createActivity(user.id, activity);
  const fac = await ctx(browser, user.id);
  await fac.page.goto("/attivita");

  // Scadenza oltre i 14 giorni: rifiutata
  await fac.page.getByRole("button", { name: "Avvia a ritmo libero" }).click();
  await fac.page.getByLabel("Scadenza").fill(localInput(Date.now() + 20 * 86_400_000));
  await fac.page.getByRole("button", { name: "Avvia", exact: true }).click();
  await expect(fac.page.getByText("Scegli una scadenza tra 10 minuti e 14 giorni da ora.")).toBeVisible();

  // Scadenza valida (3 giorni)
  await fac.page.getByLabel("Scadenza").fill(localInput(Date.now() + 3 * 86_400_000));
  await fac.page.getByRole("button", { name: "Avvia", exact: true }).click();
  await fac.page.waitForURL(/\/regia\//);
  await expect(fac.page.getByRole("heading", { name: /Risultati a ritmo libero/ })).toBeVisible();
  await expect(fac.page.getByText(/^Scade il /)).toBeVisible();
  const code = (await fac.page.locator("aside strong.font-mono").textContent())!.replace(/\s/g, "");
  expect(code).toMatch(/^\d{6}$/);

  // Partecipante: nessun nickname, avanza da solo
  const phone = await ctx(browser, undefined, true);
  await phone.page.goto(`/g/${code}`);
  await expect(phone.page.getByRole("heading", { name: "Compito a casa: ascolto" })).toBeVisible();
  await expect(phone.page.getByLabel("Nickname")).toHaveCount(0);
  await phone.page.getByRole("button", { name: "Inizia" }).click();
  await expect(phone.page.getByText("Slide 2 di 3")).toBeVisible(); // riparte dalla prima domanda aperta
  await phone.page.getByText("Molto").click();
  await phone.page.getByRole("button", { name: "Invia" }).click();
  await expect(phone.page.getByText("Risposta inviata. Grazie!")).toBeVisible();
  await expect(fac.page.getByText("1 partecipante ha iniziato")).toBeVisible();
  await expect(fac.page.getByText("100% (1)")).toBeVisible();

  await phone.page.getByRole("button", { name: /Avanti/ }).click();
  await phone.page.getByText("Aspettare il proprio turno").click();
  await phone.page.getByRole("button", { name: "Invia" }).click();
  await expect(phone.page.getByText("Risposta non corretta.")).toBeVisible();
  await expect(phone.page.getByText("Soluzione: Prestare piena attenzione")).toBeVisible();
  await expect(phone.page.getByText(/Significa concentrarsi su chi parla/)).toBeVisible();
  await phone.page.getByRole("button", { name: /Avanti/ }).click();
  await expect(phone.page.getByText("Hai completato l'attività. Grazie!")).toBeVisible();

  // Ricaricando (anche giorni dopo) la partecipazione è la stessa e non si può rispondere due volte
  await phone.page.reload();
  await expect(phone.page.getByText("Hai completato l'attività. Grazie!")).toBeVisible();
  await phone.page.getByRole("button", { name: "Rivedi le slide" }).click();
  await phone.page.getByRole("button", { name: /Avanti/ }).click();
  await expect(phone.page.getByText("Risposta inviata. Grazie!")).toBeVisible();
  await expect(phone.page.getByRole("button", { name: "Invia" })).toHaveCount(0);

  // Chiusura dalla dashboard: dati cancellati, il codice non funziona più
  fac.page.once("dialog", (d) => d.accept());
  await fac.page.getByRole("button", { name: "Chiudi e cancella i risultati" }).click();
  await expect(fac.page.getByText("Sessione chiusa")).toBeVisible();
  const late = await ctx(browser, undefined, true);
  await late.page.goto(`/g/${code}`);
  await expect(late.page.getByText("Nessuna attività attiva con questo codice.")).toBeVisible();

  for (const x of [fac, phone, late]) expect(x.offenders).toEqual([]);
  for (const x of [fac, phone, late]) await x.c.close();
});
