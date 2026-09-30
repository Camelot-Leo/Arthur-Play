import { and, desc, eq, activities, type Activity } from "@arthur/db";
import { T, type ActivityContent, DEFAULT_SETTINGS, normalizeSettings } from "@arthur/shared";
import { db } from "./services";

export function toContent(a: Activity): ActivityContent {
  return { title: a.title, description: a.description ?? undefined, slides: a.slides, settings: normalizeSettings(a.settings) };
}

export async function listOwned(userId: string) {
  return db()
    .select({ id: activities.id, title: activities.title, slides: activities.slides, updatedAt: activities.updatedAt })
    .from(activities)
    .where(eq(activities.ownerId, userId))
    .orderBy(desc(activities.updatedAt));
}

/** Attività del facilitatore (null se non esiste o appartiene ad altri). */
export async function getOwned(id: string, userId: string): Promise<Activity | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db()
    .select()
    .from(activities)
    .where(and(eq(activities.id, id), eq(activities.ownerId, userId)));
  return row ?? null;
}

export async function createDefault(userId: string): Promise<string> {
  const [row] = await db()
    .insert(activities)
    .values({
      ownerId: userId,
      title: T.activities.untitled,
      slides: [{ id: "benvenuti", type: "content", title: "Benvenuti!" }],
      settings: DEFAULT_SETTINGS,
    })
    .returning({ id: activities.id });
  return row!.id;
}

export async function updateOwned(id: string, userId: string, content: ActivityContent): Promise<boolean> {
  const rows = await db()
    .update(activities)
    .set({
      title: content.title,
      description: content.description ?? null,
      slides: content.slides,
      settings: content.settings,
      updatedAt: new Date(),
    })
    .where(and(eq(activities.id, id), eq(activities.ownerId, userId)))
    .returning({ id: activities.id });
  return rows.length === 1;
}
