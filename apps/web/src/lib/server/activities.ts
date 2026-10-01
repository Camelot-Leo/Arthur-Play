import { and, arrayContains, desc, eq, images, inArray, or, sql, activities, type Activity } from "@arthur/db";
import {
  LIMITS,
  T,
  canEdit,
  canSetLibrary,
  canView,
  DEFAULT_SETTINGS,
  normalizeSettings,
  type ActivityContent,
  type ActivityMeta,
  type Audience,
  type Library,
} from "@arthur/shared";
import type { CurrentUser } from "./auth";
import { db } from "./services";

/**
 * Accesso alle attività (Fase 6). Regole in `@arthur/shared` (library.ts):
 * attività personali solo del proprietario, libreria condivisa visibile a tutti e
 * modificabile solo dall'admin. Le query di modifica ripetono il controllo nel WHERE.
 */

export function toContent(a: Activity): ActivityContent {
  return { title: a.title, description: a.description ?? undefined, slides: a.slides, settings: normalizeSettings(a.settings) };
}
export const toMeta = (a: Activity): ActivityMeta => ({ audience: a.audience, tags: a.tags });

const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

async function getById(id: string): Promise<Activity | null> {
  if (!isUuid(id)) return null;
  const [row] = await db().select().from(activities).where(eq(activities.id, id));
  return row ?? null;
}

/** Attività visibile all'utente (propria o condivisa); null altrimenti. */
export async function getViewable(id: string, user: CurrentUser): Promise<Activity | null> {
  const row = await getById(id);
  return row && canView(row, user) ? row : null;
}

/** Attività modificabile dall'utente; null altrimenti. */
export async function getEditable(id: string, user: CurrentUser): Promise<Activity | null> {
  const row = await getById(id);
  return row && canEdit(row, user) ? row : null;
}

/** Condizione SQL equivalente a `canEdit`. */
const editableBy = (user: CurrentUser) =>
  user.role === "admin"
    ? or(eq(activities.library, "shared"), and(eq(activities.library, "personal"), eq(activities.ownerId, user.id)))
    : and(eq(activities.library, "personal"), eq(activities.ownerId, user.id));

export type ListFilters = { audience?: Audience; tag?: string };

export async function listLibrary(user: CurrentUser, library: Library, filters: ListFilters = {}) {
  const conds = [eq(activities.library, library)];
  if (library === "personal") conds.push(eq(activities.ownerId, user.id));
  if (filters.audience) conds.push(eq(activities.audience, filters.audience));
  if (filters.tag) conds.push(arrayContains(activities.tags, [filters.tag]));
  return db()
    .select({
      id: activities.id,
      title: activities.title,
      slides: activities.slides,
      audience: activities.audience,
      tags: activities.tags,
      ownerId: activities.ownerId,
      library: activities.library,
      updatedAt: activities.updatedAt,
    })
    .from(activities)
    .where(and(...conds))
    .orderBy(desc(activities.updatedAt));
}

/** Tag usati nella libreria (per il filtro). */
export async function libraryTags(user: CurrentUser, library: Library): Promise<string[]> {
  const where = library === "personal" ? and(eq(activities.library, "personal"), eq(activities.ownerId, user.id)) : eq(activities.library, "shared");
  const rows = await db()
    .select({ tag: sql<string>`distinct unnest(${activities.tags})` })
    .from(activities)
    .where(where);
  return rows.map((r) => r.tag).sort((a, b) => a.localeCompare(b, "it"));
}

async function insertActivity(ownerId: string, content: ActivityContent, meta: ActivityMeta): Promise<string> {
  const [row] = await db()
    .insert(activities)
    .values({
      ownerId,
      title: content.title,
      description: content.description ?? null,
      slides: content.slides,
      settings: content.settings,
      library: "personal",
      audience: meta.audience,
      tags: meta.tags,
    })
    .returning({ id: activities.id });
  return row!.id;
}

export async function createDefault(userId: string): Promise<string> {
  return insertActivity(
    userId,
    { title: T.activities.untitled, slides: [{ id: "benvenuti", type: "content", title: "Benvenuti!" }], settings: DEFAULT_SETTINGS },
    { audience: "studenti", tags: [] },
  );
}

export async function updateActivity(id: string, user: CurrentUser, content: ActivityContent, meta: ActivityMeta): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await db()
    .update(activities)
    .set({
      title: content.title,
      description: content.description ?? null,
      slides: content.slides,
      settings: content.settings,
      audience: meta.audience,
      tags: meta.tags,
      updatedAt: new Date(),
    })
    .where(and(eq(activities.id, id), editableBy(user)))
    .returning({ id: activities.id });
  return rows.length === 1;
}

/** Copia personale di un'attività visibile (propria o condivisa). */
export async function duplicateActivity(id: string, user: CurrentUser): Promise<string | null> {
  const row = await getViewable(id, user);
  if (!row) return null;
  const suffix = T.activities.copySuffix;
  const title = row.title.slice(0, LIMITS.titleMax - suffix.length) + suffix;
  return insertActivity(user.id, { ...toContent(row), title }, toMeta(row));
}

/**
 * Importazione da file JSON già validato. Le immagini sono riferimenti a questa istanza:
 * quelle che non esistono vengono tolte dalla slide (il resto resta invariato).
 */
export async function importActivity(user: CurrentUser, content: ActivityContent, meta: ActivityMeta): Promise<string> {
  const ids = content.slides.flatMap((s) => (s.type === "content" && s.image ? [s.image.id] : []));
  const found = ids.length ? new Set((await db().select({ id: images.id }).from(images).where(inArray(images.id, ids))).map((r) => r.id)) : new Set<string>();
  const slides = content.slides.map((s) => (s.type === "content" && s.image && !found.has(s.image.id) ? { ...s, image: undefined } : s));
  return insertActivity(user.id, { ...content, slides }, meta);
}

/** Pubblica o ritira dalla libreria condivisa (solo admin, vedi `canSetLibrary`). */
export async function setLibrary(id: string, user: CurrentUser, target: Library): Promise<boolean> {
  const row = await getById(id);
  if (!row || !canSetLibrary(row, user, target)) return false;
  const rows = await db()
    .update(activities)
    .set({ library: target, updatedAt: new Date() })
    .where(and(eq(activities.id, id), eq(activities.library, row.library)))
    .returning({ id: activities.id });
  return rows.length === 1;
}
