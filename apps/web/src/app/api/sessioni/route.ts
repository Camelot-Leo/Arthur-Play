import { z } from "zod";
import { activityContentSchema } from "@arthur/shared";
import { RATE, createSession, hit } from "@arthur/shared/server";
import { getOwned, toContent } from "@/lib/server/activities";
import { getCurrentUser } from "@/lib/server/auth";
import { fail, handle, json, readJson } from "@/lib/server/http";
import { sameOrigin } from "@/lib/server/request";
import { redis } from "@/lib/server/services";

const bodySchema = z.object({ activityId: z.string().uuid() });

/**
 * Avvio di una sessione live: il contenuto dell'attività viene fotografato in Redis
 * (scadenza massima 24 ore). PostgreSQL non riceve alcun dato della sessione.
 */
export async function POST(req: Request) {
  return handle(async () => {
    if (!(await sameOrigin(req))) return fail(403, "unauthorized");
    const user = await getCurrentUser();
    if (!user) return fail(401, "unauthorized");
    if (!(await hit(redis(), user.id, "start", RATE.startPerUser.limit, RATE.startPerUser.window))) return fail(429, "rate_limited");
    const body = bodySchema.safeParse(await readJson(req));
    if (!body.success) return fail(400, "invalid");
    const row = await getOwned(body.data.activityId, user.id);
    if (!row) return fail(404, "not_found");
    const content = activityContentSchema.safeParse(toContent(row));
    if (!content.success) return fail(400, "invalid");
    const { sid, code } = await createSession(redis(), { ownerId: user.id, activity: content.data });
    return json({ ok: true, sid, code });
  });
}
