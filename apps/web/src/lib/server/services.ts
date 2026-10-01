import { createDb, type Db } from "@arthur/db";
import { createLogger, createRedis, type Redis } from "@arthur/shared/server";

/** Connessioni condivise (una per processo, riusate anche durante l'hot reload). */
const g = globalThis as unknown as { __ap?: { db: Db; redis: Redis; logger: ReturnType<typeof createLogger> } };

function init() {
  if (!g.__ap) {
    g.__ap = { db: createDb().db, redis: createRedis(), logger: createLogger("web") };
  }
  return g.__ap;
}

export const db = () => init().db;
export const redis = () => init().redis;
export const logger = () => init().logger;
