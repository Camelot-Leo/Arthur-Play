import { expect, test } from "@playwright/test";
import { createFacilitator, loginCookie } from "./helpers";

/**
 * Fase 5: le funzioni AI sono disattivate di default (AI_ENABLED non impostato nei test).
 * Nessuna voce AI nell'interfaccia e le API rifiutano le richieste senza contattare l'esterno.
 */
test("AI disattivata di default: nessuna voce nell'interfaccia, API rifiutate", async ({ context, page }) => {
  const user = await createFacilitator();
  await context.addCookies([await loginCookie(user.id)]);

  await page.goto("/attivita");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Genera con l'AI")).toHaveCount(0);

  const res = await page.goto("/attivita/genera");
  expect(res?.status()).toBe(404);

  const headers = { origin: "http://localhost:3000" };
  const gen = await page.request.post("/api/ai/genera", { headers, multipart: { topic: "Ascolto attivo" } });
  expect(gen.status()).toBe(403);
  expect((await gen.json()).error).toBe("ai_disabled");

  const themes = await page.request.post("/api/sessioni/inesistente/temi", { headers, data: { slideId: "q2" } });
  expect([403, 404]).toContain(themes.status());
});
