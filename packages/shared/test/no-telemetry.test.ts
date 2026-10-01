import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Nessun invio di dati a terzi durante sviluppo e build: ogni script che lancia Next.js
 * deve passare da scripts/with-env.mjs, che imposta NEXT_TELEMETRY_DISABLED=1.
 */
const root = new URL("../../../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), "utf8");

describe("telemetria di Next.js disattivata", () => {
  it("il wrapper imposta NEXT_TELEMETRY_DISABLED", () => {
    expect(read("scripts/with-env.mjs")).toContain('process.env.NEXT_TELEMETRY_DISABLED = "1"');
  });
  it("tutti gli script di apps/web che usano next passano dal wrapper", () => {
    const scripts = JSON.parse(read("apps/web/package.json")).scripts as Record<string, string>;
    const withNext = Object.values(scripts).filter((s) => /\bnext\b/.test(s));
    expect(withNext.length).toBeGreaterThan(0);
    for (const s of withNext) expect(s).toMatch(/with-env\.mjs next /);
  });
  it("i test end-to-end avviano Next con la telemetria disattivata", () => {
    expect(read("playwright.config.ts")).toContain('NEXT_TELEMETRY_DISABLED: "1"');
  });
});
