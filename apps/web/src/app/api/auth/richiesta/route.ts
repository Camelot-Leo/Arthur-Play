import { z } from "zod";
import { requestLoginLink } from "@/lib/server/auth";
import { fail, handle, json, readJson } from "@/lib/server/http";
import { sameOrigin } from "@/lib/server/request";

const bodySchema = z.object({ email: z.string().trim().email().max(254) });

export async function POST(req: Request) {
  return handle(async () => {
    if (!(await sameOrigin(req))) return fail(403, "unauthorized");
    const body = bodySchema.safeParse(await readJson(req));
    if (!body.success) return fail(400, "invalid");
    const res = await requestLoginLink(body.data.email);
    if (res === "rate_limited") return fail(429, "rate_limited");
    return json({ ok: true });
  });
}
