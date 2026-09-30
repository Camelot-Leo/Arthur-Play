import { eq, images } from "@arthur/db";
import { fail, handle } from "@/lib/server/http";
import { db } from "@/lib/server/services";

/** Immagini delle slide, servite dal dominio dell'app. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(404, "not_found");
    const [row] = await db().select({ data: images.data, mime: images.mime }).from(images).where(eq(images.id, id));
    if (!row) return fail(404, "not_found");
    return new Response(new Uint8Array(row.data), {
      headers: { "content-type": row.mime, "cache-control": "public, max-age=31536000, immutable" },
    });
  });
}
