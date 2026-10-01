/**
 * Libreria delle attività (Fase 6): permessi, metadati (destinatari, tag di percorso)
 * e formato di esportazione/importazione JSON. Solo contenuto: mai risultati né dati di sessione.
 */
import { z } from "zod";
import { activityContentSchema, type ActivityContent } from "./slides/schema";

export type Role = "admin" | "facilitator";
export type Library = "personal" | "shared";
export type Audience = "studenti" | "docenti" | "entrambi";

export const AUDIENCES: Audience[] = ["studenti", "docenti", "entrambi"];
export const TAGS_MAX = 10;
export const TAG_MAX_LENGTH = 30;

type Actor = { id: string; role: Role };
type ActivityRef = { ownerId: string; library: Library };

/** Vedere, avviare, duplicare ed esportare: le proprie attività e tutta la libreria condivisa. */
export const canView = (a: ActivityRef, u: Actor) => a.ownerId === u.id || a.library === "shared";

/** Modificare: le proprie attività personali; la libreria condivisa solo l'admin. */
export const canEdit = (a: ActivityRef, u: Actor) => (a.library === "shared" ? u.role === "admin" : a.ownerId === u.id);

/**
 * Curare la libreria condivisa (solo admin): pubblicare una propria attività personale
 * oppure ritirare un'attività condivisa (torna nella libreria personale del proprietario).
 */
export const canSetLibrary = (a: ActivityRef, u: Actor, target: Library) =>
  u.role === "admin" && (target === "shared" ? a.library === "personal" && a.ownerId === u.id : a.library === "shared");

/** Tag: minuscoli, senza spazi doppi, unici, max 10 da 30 caratteri. */
export function normalizeTags(raw: string[]): string[] {
  const tags = raw.map((t) => t.trim().toLowerCase().replace(/\s+/g, " ").slice(0, TAG_MAX_LENGTH)).filter(Boolean);
  return [...new Set(tags)].slice(0, TAGS_MAX);
}

export const activityMetaSchema = z.object({
  audience: z.enum(["studenti", "docenti", "entrambi"]).default("studenti"),
  tags: z.array(z.string().max(100)).max(50).default([]).transform(normalizeTags),
});
export type ActivityMeta = z.infer<typeof activityMetaSchema>;

/** Contenuto e metadati insieme (salvataggio dall'editor e importazione). */
export const activityDocumentSchema = z
  .object({ content: activityContentSchema, meta: activityMetaSchema })
  .superRefine((d, ctx) => {
    const ids = d.content.slides.map((s) => s.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["content", "slides"], message: "id duplicati" });
  });

export const EXPORT_FORMAT = "arthur-play/attivita";
export const EXPORT_VERSION = 1;
export const IMPORT_MAX_BYTES = 1024 * 1024;

export type ActivityExport = {
  formato: typeof EXPORT_FORMAT;
  versione: typeof EXPORT_VERSION;
  attivita: ActivityContent & ActivityMeta;
};

/** File di esportazione: solo il contenuto dell'attività e i suoi metadati. */
export function buildExport(content: ActivityContent, meta: ActivityMeta): ActivityExport {
  return {
    formato: EXPORT_FORMAT,
    versione: EXPORT_VERSION,
    attivita: {
      title: content.title,
      ...(content.description ? { description: content.description } : {}),
      slides: content.slides,
      settings: content.settings,
      audience: meta.audience,
      tags: meta.tags,
    },
  };
}

const exportSchema = z.object({
  formato: z.literal(EXPORT_FORMAT),
  versione: z.literal(EXPORT_VERSION),
  attivita: z.looseObject({}),
});

/** Lettura di un file esportato; null se il formato o il contenuto non sono validi. Campi sconosciuti ignorati. */
export function parseImport(raw: unknown): { content: ActivityContent; meta: ActivityMeta } | null {
  const file = exportSchema.safeParse(raw);
  if (!file.success) return null;
  const { audience, tags, ...content } = file.data.attivita as Record<string, unknown>;
  const doc = activityDocumentSchema.safeParse({ content, meta: { audience, tags } });
  return doc.success ? doc.data : null;
}
