import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";

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

/** Trasporto reale: SDK ufficiale Anthropic, output strutturati, fallback automatico in caso di rifiuto. */
export function createAnthropicTransport(client = new Anthropic()): AiTransport {
  return {
    async structured(req, schema) {
      const response = await client.beta.messages.parse({
        model: req.model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: [{ role: "user", content: req.user }],
        output_config: { effort: req.effort, format: betaZodOutputFormat(schema) },
        // Se il modello declina la richiesta, l'API la ripete sul modello di riserva consigliato.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      if (response.stop_reason === "refusal") throw new AiRefusedError();
      if (response.parsed_output == null) throw new AiInvalidOutputError();
      return response.parsed_output as z.infer<typeof schema>;
    },
  };
}
