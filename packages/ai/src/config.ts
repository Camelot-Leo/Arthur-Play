/**
 * Configurazione delle funzioni AI (Fase 5).
 * Disattivate di default: si abilitano solo con AI_ENABLED=1. Le credenziali Anthropic
 * (ANTHROPIC_API_KEY) stanno solo nelle variabili d'ambiente del server.
 */
export type AiConfig = { enabled: boolean; model: string; fallbackModels: string[] };

/** Modello principale e riserve (provate in ordine se il precedente non è disponibile o declina). */
export const DEFAULT_MODEL = "claude-sonnet-5-5";
export const DEFAULT_FALLBACK_MODELS = ["claude-sonnet-5", "claude-haiku-4-5"];

export function aiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const model = env.AI_MODEL?.trim() || DEFAULT_MODEL;
  const list = env.AI_FALLBACK_MODELS === undefined ? DEFAULT_FALLBACK_MODELS : env.AI_FALLBACK_MODELS.split(",");
  const fallbackModels = [...new Set(list.map((m) => m.trim()).filter(Boolean))].filter((m) => m !== model);
  return { enabled: env.AI_ENABLED === "1", model, fallbackModels };
}

/** Lunghezza massima del testo di un documento inviato all'AI (nessun troncamento silenzioso). */
export const MAX_DOCUMENT_CHARS = 120_000;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
/** Minimo di risposte per il raggruppamento in temi. */
export const MIN_THEME_RESPONSES = 10;
export const MAX_THEMES = 8;
