import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * Test end-to-end: avviano realtime e web (build di produzione) su database di test.
 * Chromium preinstallato: PLAYWRIGHT_CHROMIUM_PATH (default /opt/pw-browsers/chromium).
 */
const testEnv = {
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://arthur:arthur@127.0.0.1:5432/arthur_play_test",
  REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379/14",
  APP_URL: "http://localhost:3000",
  WEB_ORIGIN: "http://localhost:3000",
  REALTIME_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e-secret",
  NEXT_TELEMETRY_DISABLED: "1",
  MAIL_CONSOLE: "1",
};
Object.assign(process.env, testEnv);

// Chromium preinstallato se presente (ambiente cloud); altrimenti quello di `playwright install chromium`.
const preinstalled = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const executablePath = existsSync(preinstalled) ? preinstalled : undefined;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    launchOptions: { executablePath },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } } }],
  webServer: [
    {
      command: "pnpm --filter @arthur/realtime start",
      url: "http://localhost:4000/health",
      env: testEnv,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @arthur/web build && pnpm --filter @arthur/web start",
      url: "http://localhost:3000/privacy",
      env: testEnv,
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
});
