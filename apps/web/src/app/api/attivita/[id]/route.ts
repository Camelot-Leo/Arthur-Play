import { activityContentSchema } from "@arthur/shared";
import { getOwned, toContent, updateOwned } from "@/lib/server/activities";
import { getCurrentUser } from "@/lib/server/auth";
import { fail, handle, json, readJson } from "@/lib/server/http";
import { sameOrigin } from "@/lib/server/request";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) return fail(401, "unauthorized");
    const row = await getOwned((await params).id, user.id);
    if (!row) return fail(404, "not_found");
    return json({ ok: true, activity: toContent(row) });
  });
}

/** Salva il contenuto dell'attività (validato lato server). Solo il proprietario. */
export async function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    if (!(await sameOrigin(req))) return fail(403, "unauthorized");
    const user = await getCurrentUser();
    if (!user) return fail(401, "unauthorized");
    const parsed = activityContentSchema.safeParse(await readJson(req));
    if (!parsed.success) return json({ ok: false, error: "invalid", issues: parsed.error.issues.map((i) => i.path.join(".")) }, 400);
    const ids = parsed.data.slides.map((s) => s.id);
    if (new Set(ids).size !== ids.length) return fail(400, "invalid");
    if (!(await updateOwned((await params).id, user.id, parsed.data))) return fail(404, "not_found");
    return json({ ok: true });
  });
}
