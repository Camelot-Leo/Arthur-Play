import { z } from "zod";
import { collectThemeInputs, groupThemes, saveThemes } from "@arthur/ai";
import { moderationTerms } from "@arthur/db";
import { RATE, getActivity, getMeta, hit, safeError } from "@arthur/shared/server";
import { getCurrentUser } from "@/lib/server/auth";
import { ai, aiErrorCode, aiTransport } from "@/lib/server/ai";
import { fail, handle, json, readJson } from "@/lib/server/http";
import { sameOrigin } from "@/lib/server/request";
import { db, logger, redis } from "@/lib/server/services";

const bodySchema = z.object({ slideId: z.string().min(1).max(40) });

/**
 * Raggruppa in temi le risposte visibili di una slide (risposta aperta o word cloud).
 * All'AI vanno solo la domanda e i testi visibili: niente nickname, token, codici, sessioni,
 * né risposte filtrate o nascoste. I temi restano in Redis con la scadenza della sessione.
 */
export async function POST(req: Request, { params }: { params: Promise<{ sid: string }> }) {
  return handle(async () => {
    if (!(await sameOrigin(req))) return fail(403, "unauthorized");
    const user = await getCurrentUser();
    if (!user) return fail(401, "unauthorized");
    const cfg = ai();
    if (!cfg.enabled) return fail(403, "ai_disabled");
    const { sid } = await params;
    const meta = await getMeta(redis(), sid);
    if (!meta || meta.ownerId !== user.id) return fail(404, "not_found");
    const body = bodySchema.safeParse(await readJson(req));
    if (!body.success) return fail(400, "invalid");
    const activity = await getActivity(redis(), sid);
    const slide = activity?.slides.find((s) => s.id === body.data.slideId);
    if (!slide || (slide.type !== "open" && slide.type !== "wordcloud")) return fail(400, "invalid");
    if (!(await hit(redis(), user.id, "ai", RATE.aiPerUser.limit, RATE.aiPerUser.window))) return fail(429, "rate_limited");

    try {
      const inputs = await collectThemeInputs(redis(), sid, slide);
      const moderation = await db().select({ term: moderationTerms.term, match: moderationTerms.match }).from(moderationTerms);
      const themes = await groupThemes(aiTransport(), cfg.model, { question: slide.question, inputs, moderation });
      await saveThemes(redis(), sid, slide.id, themes, meta.expiresAt);
      return json({ ok: true, themes });
    } catch (err) {
      const code = aiErrorCode(err);
      if (code) return fail(400, code);
      logger().error({ err: safeError(err) }, "temi AI non riusciti");
      return fail(502, "ai_error");
    }
  });
}
