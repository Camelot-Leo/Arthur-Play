import { z } from "zod";
import { ASYNC_SESSION_MAX_SECONDS, LIMITS, activityContentSchema } from "@arthur/shared";
import { RATE, createSession, hit } from "@arthur/shared/server";
import { getViewable, toContent } from "@/lib/server/activities";
import { getCurrentUser } from "@/lib/server/auth";
import { fail, handle, json, readJson } from "@/lib/server/http";
import { sameOrigin } from "@/lib/server/request";
import { redis } from "@/lib/server/services";

const bodySchema = z.object({
  activityId: z.string().uuid(),
  mode: z.enum(["live", "async"]).default("live"),
  /** Solo ritmo libero: scadenza scelta dal facilitatore (epoch ms), da 10 minuti a 14 giorni. */
  expiresAt: z.number().int().optional(),
});

/**
 * Avvio di una sessione (live, max 24 ore, o a ritmo libero, max 14 giorni): il contenuto dell'attività viene fotografato in Redis
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
    const row = await getViewable(body.data.activityId, user);
    if (!row) return fail(404, "not_found");
    const content = activityContentSchema.safeParse(toContent(row));
    if (!content.success) return fail(400, "invalid");
    let ttlSeconds: number | undefined;
    if (body.data.mode === "async") {
      const seconds = Math.floor(((body.data.expiresAt ?? 0) - Date.now()) / 1000);
      if (seconds < LIMITS.asyncMinMinutes * 60 || seconds > ASYNC_SESSION_MAX_SECONDS) return fail(400, "invalid");
      ttlSeconds = seconds;
    }
    const { sid, code } = await createSession(redis(), { ownerId: user.id, activity: content.data, mode: body.data.mode, ttlSeconds });
    return json({ ok: true, sid, code });
  });
}
