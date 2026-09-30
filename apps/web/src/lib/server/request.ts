import { headers } from "next/headers";
import { hashIp } from "@arthur/shared/server";
import { env } from "./env";
import { redis } from "./services";

/**
 * Hash dell'IP del client, solo per il rate limiting (vincolo 5).
 * L'IP arriva dal reverse proxy (TRUST_PROXY=1); non viene mai salvato né loggato.
 */
export async function clientIpHash(): Promise<string> {
  const h = await headers();
  const ip = env.trustProxy ? (h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "") : "";
  return hashIp(redis(), ip || "sconosciuto");
}

/** Protezione CSRF per le API con cookie: la richiesta deve provenire dalla nostra origine. */
export async function sameOrigin(req: Request): Promise<boolean> {
  const origin = req.headers.get("origin");
  if (!origin) return req.method === "GET";
  return origin === env.appUrl || origin === new URL(req.url).origin;
}
