import { z } from "zod";
import { consumeLoginToken } from "@/lib/server/auth";
import { fail, handle, json, readJson } from "@/lib/server/http";
import { sameOrigin } from "@/lib/server/request";

const bodySchema = z.object({ token: z.string().min(10).max(128) });

export async function POST(req: Request) {
  return handle(async () => {
    if (!(await sameOrigin(req))) return fail(403, "unauthorized");
    const body = bodySchema.safeParse(await readJson(req));
    if (!body.success) return fail(400, "invalid");
    if (!(await consumeLoginToken(body.data.token))) return fail(400, "invalid");
    return json({ ok: true });
  });
}
