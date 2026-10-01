import pino, { type Logger } from "pino";

/**
 * Logger applicativo (vincolo 5).
 * - Mai IP, nickname, testo delle risposte o payload delle richieste.
 * - Gli errori sono registrati solo con tipo, codice e stack, SENZA il messaggio
 *   (che potrebbe contenere dati in input).
 * - Le chiavi sensibili sono comunque censurate se passate per errore.
 */
export const REDACT_PATHS = [
  "ip",
  "*.ip",
  "nickname",
  "*.nickname",
  "text",
  "*.text",
  "answer",
  "*.answer",
  "payload",
  "*.payload",
  "body",
  "*.body",
  "token",
  "*.token",
  "email",
  "*.email",
  "headers",
  "*.headers",
  "req",
  "res",
];

export function safeError(err: unknown) {
  if (!(err instanceof Error)) return { type: typeof err };
  const stack = (err.stack ?? "").split("\n").slice(1).join("\n");
  return { type: err.name, code: (err as { code?: unknown }).code, stack };
}

export function createLogger(service: string, destination?: pino.DestinationStream): Logger {
  return pino(
    {
      level: process.env.LOG_LEVEL ?? "info",
      base: { service },
      redact: { paths: REDACT_PATHS, censor: "[omesso]" },
      serializers: { err: safeError },
    },
    destination,
  );
}
