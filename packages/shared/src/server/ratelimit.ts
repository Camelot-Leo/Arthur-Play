import type { Redis } from "ioredis";
import { K } from "./keys";

/**
 * Rate limiting a finestra fissa con contatori Redis a TTL breve.
 * `bucket` è sempre un valore già hashato (IP con salt, hash del token, hash dell'email).
 */
export async function hit(redis: Redis, bucket: string, action: string, limit: number, windowSeconds: number): Promise<boolean> {
  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  const key = K.rate(bucket, action, window);
  const [[, count]] = (await redis.multi().incr(key).expire(key, windowSeconds + 1).exec()) as [[null, number], unknown];
  return count <= limit;
}

/** Soglie. Per IP sono larghe perché un'intera classe esce spesso da un solo IP pubblico. */
export const RATE = {
  connectPerIp: { limit: 1200, window: 60 },
  joinPerIp: { limit: 600, window: 60 },
  answerPerIp: { limit: 6000, window: 60 },
  answerPerToken: { limit: 20, window: 10 },
  loginPerIp: { limit: 20, window: 600 },
  loginPerEmail: { limit: 5, window: 600 },
  uploadPerUser: { limit: 60, window: 600 },
  startPerUser: { limit: 30, window: 600 },
} as const;
