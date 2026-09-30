/**
 * Avvio del servizio realtime.
 * Nessun log di accesso: il server HTTP risponde solo a Socket.IO e a /health.
 */
import { createServer } from "node:http";
import { createDb, moderationTerms } from "@arthur/db";
import { createLogger, createRedis } from "@arthur/shared/server";
import { ModerationStore } from "./moderation";
import { createRealtimeServer } from "./server";

const logger = createLogger("realtime");
const secret = process.env.REALTIME_SECRET;
if (!secret || secret.length < 32) {
  logger.fatal("REALTIME_SECRET mancante o troppo corto (min 32 caratteri)");
  process.exit(1);
}

const port = Number(process.env.REALTIME_PORT ?? 4000);
const corsOrigin = (process.env.WEB_ORIGIN ?? "http://localhost:3000").split(",").map((s) => s.trim());

const redis = createRedis();
const pub = createRedis();
const sub = pub.duplicate();
const { db } = createDb(undefined, 2);

const moderation = new ModerationStore(async () =>
  (await db.select({ term: moderationTerms.term, match: moderationTerms.match }).from(moderationTerms)).map((t) => ({ term: t.term, match: t.match })),
);
try {
  await moderation.refresh();
} catch (err) {
  logger.warn({ err }, "liste di moderazione non caricate dal database: uso le liste iniziali");
}
setInterval(() => moderation.refresh().catch((err) => logger.warn({ err }, "aggiornamento liste di moderazione non riuscito")), 60_000).unref();

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    return;
  }
  // Le richieste Socket.IO sono gestite dal server collegato; tutto il resto è 404.
  if (!req.url?.startsWith("/rt")) res.writeHead(404).end();
});

createRealtimeServer({
  httpServer,
  redis,
  pubsub: { pub, sub },
  moderation,
  logger,
  ticketSecret: secret,
  corsOrigin,
  trustProxy: process.env.TRUST_PROXY === "1",
});

httpServer.listen(port, () => logger.info({ port }, "servizio realtime avviato"));
