import { duplicateActivity } from "@/lib/server/activities";
import { getCurrentUser } from "@/lib/server/auth";
import { fail, handle, json } from "@/lib/server/http";
import { sameOrigin } from "@/lib/server/request";

/** Crea una copia personale di un'attività propria o della libreria condivisa. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    if (!(await sameOrigin(req))) return fail(403, "unauthorized");
    const user = await getCurrentUser();
    if (!user) return fail(401, "unauthorized");
    const id = await duplicateActivity((await params).id, user);
    if (!id) return fail(404, "not_found");
    return json({ ok: true, id });
  });
}
