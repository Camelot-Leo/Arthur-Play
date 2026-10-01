import { notFound } from "next/navigation";
import { getMeta } from "@arthur/shared/server";
import { requireUser } from "./auth";
import { env } from "./env";
import { redis } from "./services";

/** Verifica che la sessione esista e appartenga al facilitatore autenticato. */
export async function requireOwnedSession(sid: string) {
  const user = await requireUser();
  const meta = await getMeta(redis(), sid);
  if (!meta || meta.ownerId !== user.id) notFound();
  return { user, meta, joinBase: env.appUrl };
}
