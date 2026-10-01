import { eq, moderationTerms } from "@arthur/db";
import { currentAdmin } from "@/lib/server/admin";
import { fail, handle, json } from "@/lib/server/http";
import { sameOrigin } from "@/lib/server/request";
import { db } from "@/lib/server/services";

/** Rimuove un termine dalle liste di moderazione (solo admin). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    if (!(await sameOrigin(req))) return fail(403, "unauthorized");
    if (!(await currentAdmin())) return fail(403, "forbidden");
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(404, "not_found");
    const rows = await db().delete(moderationTerms).where(eq(moderationTerms.id, id)).returning({ id: moderationTerms.id });
    if (rows.length === 0) return fail(404, "not_found");
    return json({ ok: true });
  });
}
