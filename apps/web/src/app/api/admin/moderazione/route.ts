import { z } from "zod";
import { moderationTerms } from "@arthur/db";
import { currentAdmin } from "@/lib/server/admin";
import { fail, handle, json, readJson } from "@/lib/server/http";
import { sameOrigin } from "@/lib/server/request";
import { db } from "@/lib/server/services";

const bodySchema = z.object({
  lang: z.enum(["it", "en"]),
  term: z.string().trim().toLowerCase().min(2).max(50),
  match: z.enum(["word", "contains"]),
});

/** Aggiunge un termine alle liste di moderazione (il realtime le ricarica entro un minuto). */
export async function POST(req: Request) {
  return handle(async () => {
    if (!(await sameOrigin(req))) return fail(403, "unauthorized");
    if (!(await currentAdmin())) return fail(403, "forbidden");
    const body = bodySchema.safeParse(await readJson(req));
    if (!body.success) return fail(400, "invalid");
    const rows = await db().insert(moderationTerms).values(body.data).onConflictDoNothing().returning({ id: moderationTerms.id });
    if (rows.length === 0) return fail(409, "exists");
    return json({ ok: true, id: rows[0]!.id });
  });
}
