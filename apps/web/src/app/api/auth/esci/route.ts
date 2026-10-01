import { logout } from "@/lib/server/auth";
import { fail, handle, json } from "@/lib/server/http";
import { sameOrigin } from "@/lib/server/request";

export async function POST(req: Request) {
  return handle(async () => {
    if (!(await sameOrigin(req))) return fail(403, "unauthorized");
    await logout();
    return json({ ok: true });
  });
}
