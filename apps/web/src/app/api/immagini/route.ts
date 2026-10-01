import sharp, { type OutputInfo } from "sharp";
import { images } from "@arthur/db";
import { LIMITS } from "@arthur/shared";
import { RATE, hit } from "@arthur/shared/server";
import { getCurrentUser } from "@/lib/server/auth";
import { fail, handle, json } from "@/lib/server/http";
import { sameOrigin } from "@/lib/server/request";
import { db, redis } from "@/lib/server/services";

const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Caricamento immagine di una slide di contenuto (solo facilitatori).
 * L'immagine viene ridimensionata (max 1600 px), convertita in WebP e privata dei
 * metadati (EXIF, GPS) prima di essere salvata in PostgreSQL.
 */
export async function POST(req: Request) {
  return handle(async () => {
    if (!(await sameOrigin(req))) return fail(403, "unauthorized");
    const user = await getCurrentUser();
    if (!user) return fail(401, "unauthorized");
    if (!(await hit(redis(), user.id, "upload", RATE.uploadPerUser.limit, RATE.uploadPerUser.window))) return fail(429, "rate_limited");

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File) || !ACCEPTED.has(file.type) || file.size > LIMITS.imageUploadMaxBytes) return fail(400, "invalid");

    const input = Buffer.from(await file.arrayBuffer());
    let out: { data: Buffer; info: OutputInfo };
    try {
      out = await sharp(input, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: LIMITS.imageMaxSide, height: LIMITS.imageMaxSide, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer({ resolveWithObject: true });
    } catch {
      return fail(400, "invalid");
    }
    const [row] = await db()
      .insert(images)
      .values({ ownerId: user.id, mime: "image/webp", data: out.data, width: out.info.width, height: out.info.height })
      .returning({ id: images.id });
    return json({ ok: true, id: row!.id });
  });
}
