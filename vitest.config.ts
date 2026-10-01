import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/realtime/test/**/*.test.ts"],
    env: {
      // Database Redis 15 e database Postgres dedicati ai test.
      REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379/15",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://arthur:arthur@127.0.0.1:5432/arthur_play_test",
      LOG_LEVEL: "info",
    },
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
