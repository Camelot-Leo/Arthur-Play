import { z } from "zod";
import { inviteUser } from "@/lib/server/auth";
import { currentAdmin } from "@/lib/server/admin";
import { fail, handle, json, readJson } from "@/lib/server/http";
import { sameOrigin } from "@/lib/server/request";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().max(200).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/),
  role: z.enum(["admin", "facilitator"]).default("facilitator"),
});

/** Invito di un nuovo account (solo admin; nessuna registrazione pubblica). */
export async function POST(req: Request) {
  return handle(async () => {
    if (!(await sameOrigin(req))) return fail(403, "unauthorized");
    if (!(await currentAdmin())) return fail(403, "forbidden");
    const body = bodySchema.safeParse(await readJson(req));
    if (!body.success) return fail(400, "invalid");
    if ((await inviteUser(body.data)) === "exists") return fail(409, "exists");
    return json({ ok: true });
  });
}
