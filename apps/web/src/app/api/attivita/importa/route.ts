import { IMPORT_MAX_BYTES, parseImport } from "@arthur/shared";
import { importActivity } from "@/lib/server/activities";
import { getCurrentUser } from "@/lib/server/auth";
import { fail, handle, json } from "@/lib/server/http";
import { sameOrigin } from "@/lib/server/request";

/** Importa un file JSON esportato da Arthur Play come nuova attività personale. */
export async function POST(req: Request) {
  return handle(async () => {
    if (!(await sameOrigin(req))) return fail(403, "unauthorized");
    const user = await getCurrentUser();
    if (!user) return fail(401, "unauthorized");
    const text = await req.text().catch(() => "");
    if (!text || Buffer.byteLength(text) > IMPORT_MAX_BYTES) return fail(400, "invalid");
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return fail(400, "invalid");
    }
    const doc = parseImport(raw);
    if (!doc) return fail(400, "invalid");
    const id = await importActivity(user, doc.content, doc.meta);
    return json({ ok: true, id });
  });
}
