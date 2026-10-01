import { activityDocumentSchema } from "@arthur/shared";
import { getViewable, toContent, toMeta, updateActivity } from "@/lib/server/activities";
import { getCurrentUser } from "@/lib/server/auth";
import { fail, handle, json, readJson } from "@/lib/server/http";
import { sameOrigin } from "@/lib/server/request";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) return fail(401, "unauthorized");
    const row = await getViewable((await params).id, user);
    if (!row) return fail(404, "not_found");
    return json({ ok: true, activity: toContent(row), meta: toMeta(row) });
  });
}

/**
 * Salva contenuto e metadati (validati lato server). Solo chi può modificarla:
 * il proprietario per le attività personali, l'admin per la libreria condivisa.
 */
export async function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    if (!(await sameOrigin(req))) return fail(403, "unauthorized");
    const user = await getCurrentUser();
    if (!user) return fail(401, "unauthorized");
    const parsed = activityDocumentSchema.safeParse(await readJson(req));
    if (!parsed.success) return json({ ok: false, error: "invalid", issues: parsed.error.issues.map((i) => i.path.join(".")) }, 400);
    const id = (await params).id;
    if (await updateActivity(id, user, parsed.data.content, parsed.data.meta)) return json({ ok: true });
    // Visibile ma non modificabile (libreria condivisa per un facilitatore) → 403; altrimenti 404.
    return (await getViewable(id, user)) ? fail(403, "forbidden") : fail(404, "not_found");
  });
}
