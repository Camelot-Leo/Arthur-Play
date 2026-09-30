import { Redis } from "ioredis";

export * from "./keys";
export * from "./crypto";
export * from "./ratelimit";
export * from "./sessions";
export * from "./logger-redact";
export { SEED_TERMS } from "../moderation/seed";
export type { SeedTerm } from "../moderation/seed";

export function createRedis(url = process.env.REDIS_URL ?? "redis://127.0.0.1:6379/0"): Redis {
  return new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: false });
}
export type { Redis };
export * from "./tickets";
