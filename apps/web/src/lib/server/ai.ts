import { aiConfig, createAnthropicTransport, type AiTransport } from "@arthur/ai";

/**
 * Funzioni AI lato server. Disattivate di default (AI_ENABLED=1 per attivarle).
 * La chiave ANTHROPIC_API_KEY resta nelle variabili d'ambiente del server.
 */
let transport: AiTransport | null = null;

export const ai = () => aiConfig();

export function aiTransport(): AiTransport {
  transport ??= createAnthropicTransport();
  return transport;
}

import { AiInvalidOutputError, AiRefusedError, DocumentError, TooFewResponsesError } from "@arthur/ai";

/** Codice d'errore mostrabile (testi in it.ts → ai.errors). Mai il contenuto della richiesta. */
export function aiErrorCode(err: unknown): string | null {
  if (err instanceof DocumentError) return err.code;
  if (err instanceof TooFewResponsesError) return "too_few";
  if (err instanceof AiRefusedError) return "ai_refused";
  if (err instanceof AiInvalidOutputError) return "ai_invalid_output";
  return null;
}
