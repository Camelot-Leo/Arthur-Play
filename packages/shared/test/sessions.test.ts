import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ActivityContent } from "../src/slides/schema";
import { K, closeSession, createRedis, createSession, getMeta, hashIp, hit, resetSaltCache, sessionKeys, sidByCode } from "../src/server";

const redis = createRedis();
const activity: ActivityContent = {
  title: "Test",
  slides: [{ id: "c1", type: "content", title: "Benvenuti" }],
  settings: { leaderboard: false, moderation: true },
};

beforeAll(async () => {
  if (!process.env.REDIS_URL?.endsWith("/15")) throw new Error("I test devono usare il database Redis 15");
  await redis.flushdb();
});
afterAll(async () => {
  await redis.quit();
});

describe("Redis senza persistenza su disco", () => {
  it("RDB e AOF sono disattivati", async () => {
    const save = (await redis.config("GET", "save")) as string[];
    const aof = (await redis.config("GET", "appendonly")) as string[];
    expect(save[1]).toBe("");
    expect(aof[1]).toBe("no");
  });
});

describe("ciclo di vita della sessione", () => {
  it("ogni chiave della sessione ha un TTL di massimo 24 ore", async () => {
    const { sid, code } = await createSession(redis, { ownerId: "u1", activity });
    expect(code).toMatch(/^\d{6}$/);
    expect(await sidByCode(redis, code)).toBe(sid);
    for (const key of [...(await sessionKeys(redis, sid)), K.code(code), K.userSessions("u1")]) {
      const ttl = await redis.pttl(key);
      expect(ttl, key).toBeGreaterThan(0);
      expect(ttl, key).toBeLessThanOrEqual(24 * 3600 * 1000);
    }
    await closeSession(redis, sid);
  });

  it("alla chiusura non resta nessuna chiave della sessione", async () => {
    const { sid, code } = await createSession(redis, { ownerId: "u2", activity });
    await redis.hset(K.participants(sid), "hash", JSON.stringify({ n: "Volpe" }));
    await closeSession(redis, sid);
    expect(await sessionKeys(redis, sid)).toEqual([]);
    expect(await redis.exists(K.code(code))).toBe(0);
    expect(await getMeta(redis, sid)).toBeNull();
    expect(await redis.sismember(K.userSessions("u2"), sid)).toBe(0);
  });

  it("alla scadenza le chiavi spariscono da sole", async () => {
    const { sid, code } = await createSession(redis, { ownerId: "u3", activity, ttlSeconds: 1 });
    expect((await sessionKeys(redis, sid)).length).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 1300));
    expect(await sessionKeys(redis, sid)).toEqual([]);
    expect(await redis.exists(K.code(code))).toBe(0);
  });
});

describe("IP e rate limiting", () => {
  it("l'IP è salvato solo come HMAC con salt a scadenza di 24 ore", async () => {
    resetSaltCache();
    const h = await hashIp(redis, "203.0.113.7");
    expect(h).not.toContain("203.0.113.7");
    const ttl = await redis.ttl(K.salt());
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(24 * 3600);
    // Nessuna chiave Redis contiene l'IP in chiaro
    const keys = await redis.keys("*");
    expect(keys.some((k) => k.includes("203.0.113.7"))).toBe(false);
  });

  it("i contatori bloccano oltre la soglia e scadono", async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) results.push(await hit(redis, "bucket-test", "azione", 3, 60));
    expect(results).toEqual([true, true, true, false]);
    const keys = await redis.keys("ap:rl:bucket-test:*");
    expect(keys.length).toBe(1);
    expect(await redis.ttl(keys[0]!)).toBeGreaterThan(0);
  });
});
