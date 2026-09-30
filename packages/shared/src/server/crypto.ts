import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import type { Redis } from "ioredis";
import { K } from "./keys";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 16) => randomBytes(bytes).toString("base64url");
export const randomCode = () => String(randomInt(100000, 1000000));

const SALT_TTL_SECONDS = 24 * 60 * 60;
let cachedSalt: { value: string; until: number } | null = null;

/**
 * Salt per l'hash degli IP. Vive solo in Redis con TTL di 24 ore: alla scadenza
 * ne viene generato uno nuovo, quindi gli hash non sono collegabili tra giorni diversi.
 */
async function currentSalt(redis: Redis): Promise<string> {
  const now = Date.now();
  if (cachedSalt && cachedSalt.until > now) return cachedSalt.value;
  let salt = await redis.get(K.salt());
  if (!salt) {
    await redis.set(K.salt(), randomToken(32), "EX", SALT_TTL_SECONDS, "NX");
    salt = (await redis.get(K.salt()))!;
  }
  cachedSalt = { value: salt, until: now + 60_000 };
  return salt;
}

/** HMAC dell'IP con il salt corrente, troncato. L'IP in chiaro non viene mai salvato. */
export async function hashIp(redis: Redis, ip: string): Promise<string> {
  const salt = await currentSalt(redis);
  return createHmac("sha256", salt).update(ip).digest("base64url").slice(0, 22);
}

/** Solo per i test. */
export function resetSaltCache() {
  cachedSalt = null;
}
