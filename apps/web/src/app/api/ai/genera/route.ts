import { DOCX_MIME, PDF_MIME, extractDocumentText, generateActivity } from "@arthur/ai";
import { RATE, hit, safeError } from "@arthur/shared/server";
import { activities } from "@arthur/db";
import { getCurrentUser } from "@/lib/server/auth";
import { ai, aiErrorCode, aiTransport } from "@/lib/server/ai";
import { fail, handle, json } from "@/lib/server/http";
import { sameOrigin } from "@/lib/server/request";
import { db, logger, redis } from "@/lib/server/services";

/**
 * Genera una bozza di attività da un argomento o da un documento (PDF/DOCX).
 * Il documento è letto in memoria e scartato: non viene salvato né loggato.
 * La bozza viene salvata come attività del facilitatore, modificabile nell'editor.
 */
export async function POST(req: Request) {
  return handle(async () => {
    if (!(await sameOrigin(req))) return fail(403, "unauthorized");
    const user = await getCurrentUser();
    if (!user) return fail(401, "unauthorized");
    const cfg = ai();
    if (!cfg.enabled) return fail(403, "ai_disabled");
    if (!(await hit(redis(), user.id, "ai", RATE.aiPerUser.limit, RATE.aiPerUser.window))) return fail(429, "rate_limited");

    const form = await req.formData().catch(() => null);
    if (!form) return fail(400, "invalid");
    const topic = String(form.get("topic") ?? "").trim().slice(0, 500);
    const audience = form.get("audience") === "docenti" ? "docenti" : "studenti";
    const slideCount = Math.min(20, Math.max(3, Number(form.get("slideCount")) || 8));
    const file = form.get("file");

    try {
      let documentText: string | undefined;
      if (file instanceof File && file.size > 0) {
        const mime = file.type === PDF_MIME || file.name.toLowerCase().endsWith(".pdf") ? PDF_MIME : file.type === DOCX_MIME || file.name.toLowerCase().endsWith(".docx") ? DOCX_MIME : file.type;
        documentText = await extractDocumentText(new Uint8Array(await file.arrayBuffer()), mime);
      } else if (!topic) {
        return fail(400, "invalid");
      }
      const content = await generateActivity(aiTransport(), cfg.model, { topic, documentText, audience, slideCount });
      const [row] = await db()
        .insert(activities)
        .values({
          ownerId: user.id,
          title: content.title,
          description: content.description ?? null,
          slides: content.slides,
          settings: content.settings,
          audience,
        })
        .returning({ id: activities.id });
      return json({ ok: true, id: row!.id });
    } catch (err) {
      const code = aiErrorCode(err);
      if (code) return fail(400, code);
      logger().error({ err: safeError(err) }, "generazione AI non riuscita");
      return fail(502, "ai_error");
    }
  });
}
