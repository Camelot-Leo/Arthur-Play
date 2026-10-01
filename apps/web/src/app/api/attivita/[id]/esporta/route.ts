import { buildExport } from "@arthur/shared";
import { getViewable, toContent, toMeta } from "@/lib/server/activities";
import { getCurrentUser } from "@/lib/server/auth";
import { fail, handle } from "@/lib/server/http";

/** File JSON dell'attività: solo contenuto e metadati, mai risultati né dati di sessione. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) return fail(401, "unauthorized");
    const row = await getViewable((await params).id, user);
    if (!row) return fail(404, "not_found");
    const slug =
      row.title
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) || "attivita";
    return new Response(JSON.stringify(buildExport(toContent(row), toMeta(row)), null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${slug}.json"`,
        "cache-control": "no-store",
      },
    });
  });
}
