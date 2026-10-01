import { getMeta, signTicket } from "@arthur/shared/server";
import { getCurrentUser } from "@/lib/server/auth";
import { requireRealtimeSecret } from "@/lib/server/env";
import { fail, handle } from "@/lib/server/http";
import { redis } from "@/lib/server/services";

/** Ticket di 5 minuti per collegare Regia o Proiezione al servizio realtime. */
export async function GET(req: Request, { params }: { params: Promise<{ sid: string }> }) {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) return fail(401, "unauthorized");
    const { sid } = await params;
    const role = new URL(req.url).searchParams.get("ruolo") === "proiezione" ? "projection" : "control";
    const meta = await getMeta(redis(), sid);
    if (!meta || meta.ownerId !== user.id) return fail(404, "not_found");
    const ticket = await signTicket(requireRealtimeSecret(), { sid, uid: user.id, role });
    return new Response(JSON.stringify({ ok: true, ticket }), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  });
}
