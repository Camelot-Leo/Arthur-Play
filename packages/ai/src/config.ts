/**
 * Configurazione delle funzioni AI (Fase 5).
 * Disattivate di default: si abilitano solo con AI_ENABLED=1. Le credenziali Anthropic
 * (ANTHROPIC_API_KEY) stanno solo nelle variabili d'ambiente del server.
 */
export type AiConfig = { enabled: boolean; model: string };

export function aiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  return {
    enabled: env.AI_ENABLED === "1",
    model: env.AI_MODEL?.trim() || "claude-opus-5-5",
  };
}

/** Lunghezza massima del testo di un documento inviato all'AI (nessun troncamento silenzioso). */
export const MAX_DOCUMENT_CHARS = 120_000;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
/** Minimo di risposte per il raggruppamento in temi. */
export const MIN_THEME_RESPONSES = 10;
export const MAX_THEMES = 8;
