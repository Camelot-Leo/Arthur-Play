import { NextResponse } from "next/server";
import { safeError } from "@arthur/shared/server";
import { logger } from "./services";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });

/** Esegue il gestore; in caso di errore registra solo tipo e stack, mai il payload. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    logger().error({ err: safeError(err) }, "errore API");
    return fail(500, "generic");
  }
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
