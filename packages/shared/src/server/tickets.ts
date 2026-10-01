import { jwtVerify, SignJWT } from "jose";

/**
 * Ticket di accesso di Regia e Proiezione al servizio realtime.
 * Emesso da Next (utente autenticato e proprietario della sessione), valido 5 minuti.
 */
export type TicketClaims = { sid: string; uid: string; role: "control" | "projection" };

const key = (secret: string) => new TextEncoder().encode(secret);

export async function signTicket(secret: string, claims: TicketClaims, ttlSeconds = 300): Promise<string> {
  return new SignJWT({ sid: claims.sid, role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.uid)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .setAudience("arthur-realtime")
    .sign(key(secret));
}

export async function verifyTicket(secret: string, ticket: string): Promise<TicketClaims | null> {
  try {
    const { payload } = await jwtVerify(ticket, key(secret), { audience: "arthur-realtime", algorithms: ["HS256"] });
    const role = payload.role;
    if (typeof payload.sid !== "string" || typeof payload.sub !== "string") return null;
    if (role !== "control" && role !== "projection") return null;
    return { sid: payload.sid, uid: payload.sub, role };
  } catch {
    return null;
  }
}
