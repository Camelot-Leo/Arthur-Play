
/** Variabili d'ambiente lato server. I segreti stanno solo qui, mai nel codice. */
export const env = {
  appUrl: (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  realtimeSecret: process.env.REALTIME_SECRET ?? "",
  trustProxy: process.env.TRUST_PROXY === "1",
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.MAIL_FROM ?? "Arthur Play <no-reply@localhost>",
  },
  isProd: process.env.NODE_ENV === "production",
};

export function requireRealtimeSecret(): string {
  if (env.realtimeSecret.length < 32) throw new Error("REALTIME_SECRET mancante o troppo corto");
  return env.realtimeSecret;
}
