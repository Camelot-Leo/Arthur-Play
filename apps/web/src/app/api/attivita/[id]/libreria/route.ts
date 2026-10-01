import { z } from "zod";
import { setLibrary } from "@/lib/server/activities";
import { getCurrentUser } from "@/lib/server/auth";
import { fail, handle, json, readJson } from "@/lib/server/http";
import { sameOrigin } from "@/lib/server/request";

const bodySchema = z.object({ library: z.enum(["personal", "shared"]) });

/** Cura della libreria condivisa: solo admin (pubblica una propria attività o ritira una condivisa). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    if (!(await sameOrigin(req))) return fail(403, "unauthorized");
    const user = await getCurrentUser();
    if (!user) return fail(401, "unauthorized");
    if (user.role !== "admin") return fail(403, "forbidden");
    const body = bodySchema.safeParse(await readJson(req));
    if (!body.success) return fail(400, "invalid");
    if (!(await setLibrary((await params).id, user, body.data.library))) return fail(404, "not_found");
    return json({ ok: true });
  });
}
