import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { and, eq, gt, isNull, lt, sql, authSessions, loginTokens, users, type User } from "@arthur/db";
import { T } from "@arthur/shared";
import { RATE, hit, randomToken, sha256 } from "@arthur/shared/server";
import { env } from "./env";
import { sendMail } from "./mail";
import { clientIpHash } from "./request";
import { db, redis } from "./services";

export const SESSION_COOKIE = "ap_sess";
const SESSION_DAYS = 30;
const LOGIN_TOKEN_MINUTES = 15;
const INVITE_DAYS = 7;

export type CurrentUser = Pick<User, "id" | "email" | "name" | "role">;

/**
 * Richiesta di magic link. La risposta è sempre la stessa, che l'email esista o no
 * (nessuna enumerazione degli account). Rate limit per IP hashato e per email hashata.
 */
export async function requestLoginLink(emailRaw: string): Promise<"ok" | "rate_limited"> {
  const email = emailRaw.trim().toLowerCase();
  const ipHash = await clientIpHash();
  const okIp = await hit(redis(), ipHash, "login", RATE.loginPerIp.limit, RATE.loginPerIp.window);
  const okEmail = await hit(redis(), sha256(email), "login", RATE.loginPerEmail.limit, RATE.loginPerEmail.window);
  if (!okIp || !okEmail) return "rate_limited";

  const [user] = await db()
    .select({ id: users.id })
    .from(users)
    .where(and(sql`lower(${users.email}) = ${email}`, isNull(users.disabledAt)));
  if (!user) return "ok";

  const token = randomToken(32);
  await db()
    .insert(loginTokens)
    .values({ tokenHash: sha256(token), userId: user.id, purpose: "login", expiresAt: new Date(Date.now() + LOGIN_TOKEN_MINUTES * 60_000) });
  const url = `${env.appUrl}/login/verifica?t=${encodeURIComponent(token)}`;
  await sendMail(email, T.auth.emailSubject, T.auth.emailBody(url));
  return "ok";
}

/** Consuma il magic link (monouso) e apre la sessione del facilitatore. */
export async function consumeLoginToken(token: string): Promise<boolean> {
  if (!token || token.length > 128) return false;
  const now = new Date();
  const [row] = await db()
    .update(loginTokens)
    .set({ usedAt: now })
    .where(and(eq(loginTokens.tokenHash, sha256(token)), isNull(loginTokens.usedAt), gt(loginTokens.expiresAt, now)))
    .returning({ userId: loginTokens.userId });
  if (!row) return false;

  const [user] = await db().select({ disabledAt: users.disabledAt }).from(users).where(eq(users.id, row.userId));
  if (!user || user.disabledAt) return false;

  const sessionId = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db().insert(authSessions).values({ idHash: sha256(sessionId), userId: row.userId, expiresAt });
  // Pulizia di token e sessioni scaduti.
  await db().delete(loginTokens).where(lt(loginTokens.expiresAt, now));
  await db().delete(authSessions).where(lt(authSessions.expiresAt, now));

  (await cookies()).set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return true;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const sessionId = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionId || sessionId.length > 128) return null;
  const [row] = await db()
    .select({ id: users.id, email: users.email, name: users.name, role: users.role })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(eq(authSessions.idHash, sha256(sessionId)), gt(authSessions.expiresAt, new Date()), isNull(users.disabledAt)));
  return row ?? null;
}

/** Per le pagine riservate: reindirizza al login se non autenticato. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Per le pagine dell'admin: 404 per chi non è admin (non si rivela che la pagina esiste). */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") notFound();
  return user;
}

/**
 * Invito di un facilitatore (solo admin): crea l'account e invia un link di accesso
 * monouso valido 7 giorni. Unici dati salvati: nome ed email.
 */
export async function inviteUser(input: { name: string; email: string; role: "admin" | "facilitator" }): Promise<"ok" | "exists"> {
  const email = input.email.trim().toLowerCase();
  const [existing] = await db().select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`);
  if (existing) return "exists";
  // Tutto o niente: se l'email non parte, l'account non viene creato.
  await db().transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ email, name: input.name.trim(), role: input.role }).returning({ id: users.id });
    const token = randomToken(32);
    await tx
      .insert(loginTokens)
      .values({ tokenHash: sha256(token), userId: user!.id, purpose: "invite", expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) });
    const url = `${env.appUrl}/login/verifica?t=${encodeURIComponent(token)}`;
    await sendMail(email, T.auth.inviteSubject, T.auth.inviteBody(url));
  });
  return "ok";
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const sessionId = jar.get(SESSION_COOKIE)?.value;
  if (sessionId) await db().delete(authSessions).where(eq(authSessions.idHash, sha256(sessionId)));
  jar.delete(SESSION_COOKIE);
}
