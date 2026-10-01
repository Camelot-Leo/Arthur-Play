import { createDefault } from "@/lib/server/activities";
import { getCurrentUser } from "@/lib/server/auth";
import { fail, handle, json } from "@/lib/server/http";
import { sameOrigin } from "@/lib/server/request";

/** Crea una nuova attività vuota del facilitatore. */
export async function POST(req: Request) {
  return handle(async () => {
    if (!(await sameOrigin(req))) return fail(403, "unauthorized");
    const user = await getCurrentUser();
    if (!user) return fail(401, "unauthorized");
    const id = await createDefault(user.id);
    return json({ ok: true, id });
  });
}
