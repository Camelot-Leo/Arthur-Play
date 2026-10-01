import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

/**
 * Unico punto di uscita verso il fornitore AI. Riceve solo ciò che i moduli `generate` e
 * `themes` preparano (contenuti del facilitatore e testi visibili, mai dati dei partecipanti).
 * Nei test viene sostituito da una simulazione che registra le richieste.
 */
export type AiRequest = {
  model: string;
  system: string;
  user: string;
  effort: "low" | "medium" | "high";
  maxTokens: number;
};

export type AiTransport = {
  structured<S extends z.ZodType>(req: AiRequest, schema: S): Promise<z.infer<S>>;
};

export class AiRefusedError extends Error {
  constructor() {
    super("ai_refused");
    this.name = "AiRefusedError";
  }
}
export class AiInvalidOutputError extends Error {
  constructor() {
    super("ai_invalid_output");
    this.name = "AiInvalidOutputError";
  }
}

/** Haiku 4.5 non usa il parametro effort: per quel modello non viene inviato. */
const supportsEffort = (model: string) => !model.startsWith("claude-haiku-4");

/** Trasporto reale: SDK ufficiale Anthropic con output strutturati. */
export function createAnthropicTransport(client = new Anthropic({ maxRetries: 1 })): AiTransport {
  return {
    async structured(req, schema) {
      const response = await client.messages.parse({
        model: req.model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: [{ role: "user", content: req.user }],
        output_config: { ...(supportsEffort(req.model) ? { effort: req.effort } : {}), format: zodOutputFormat(schema) },
      });
      if (response.stop_reason === "refusal") throw new AiRefusedError();
      if (response.parsed_output == null) throw new AiInvalidOutputError();
      return response.parsed_output as z.infer<typeof schema>;
    },
  };
}

/**
 * Errori per cui ha senso passare al modello di riserva: rifiuto, output non valido,
 * modello sovraccarico, non disponibile o limite di richieste, problemi di rete.
 * Non si riprova per richieste non valide o chiave errata (400, 401, 403).
 */
export function isFallbackError(err: unknown): boolean {
  if (err instanceof AiRefusedError || err instanceof AiInvalidOutputError) return true;
  if (err instanceof Anthropic.APIConnectionError) return true;
  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? 0;
    return status === 404 || status === 408 || status === 429 || status >= 500;
  }
  return false;
}

/**
 * Catena di modelli: prova il modello della richiesta, poi le riserve nell'ordine dato.
 * La richiesta resta identica (stessi testi), cambia solo il modello.
 */
export function withFallbacks(inner: AiTransport, fallbackModels: string[]): AiTransport {
  return {
    async structured(req, schema) {
      const chain = [req.model, ...fallbackModels.filter((m) => m !== req.model)];
      let last: unknown;
      for (const model of chain) {
        try {
          return await inner.structured({ ...req, model }, schema);
        } catch (err) {
          last = err;
          if (!isFallbackError(err)) throw err;
        }
      }
      throw last;
    },
  };
}
