import { DEFAULT_SETTINGS } from "@arthur/shared";
import type { BrowserContext, Page, Request } from "@playwright/test";
import { activities, authSessions, createDb, eq, loginTokens, moderationTerms, sql, users } from "@arthur/db";
import type { ActivityContent } from "@arthur/shared";
import { randomToken, sha256 } from "@arthur/shared/server";

const { db, client } = createDb(process.env.DATABASE_URL, 2);
export const closeDb = () => client.end();

export async function createFacilitator(role: "facilitator" | "admin" = "facilitator") {
  const email = `${role === "admin" ? "admin" : "facilitatore"}-${randomToken(6).toLowerCase()}@example.it`;
  const [user] = await db
    .insert(users)
    .values({ email, name: role === "admin" ? "Admin di prova" : "Facilitatore di prova", role })
    .returning({ id: users.id });
  return { id: user!.id, email };
}

/** Sessione di login pronta (equivalente a un magic link già consumato). */
export async function loginCookie(userId: string) {
  const sid = randomToken(32);
  await db.insert(authSessions).values({ idHash: sha256(sid), userId, expiresAt: new Date(Date.now() + 3_600_000) });
  return { name: "ap_sess", value: sid, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const };
}

export async function createLoginToken(userId: string) {
  const token = randomToken(32);
  await db.insert(loginTokens).values({ tokenHash: sha256(token), userId, purpose: "login", expiresAt: new Date(Date.now() + 900_000) });
  return token;
}

export async function createActivity(
  ownerId: string,
  content: ActivityContent,
  opts: { library?: "personal" | "shared"; audience?: "studenti" | "docenti" | "entrambi"; tags?: string[] } = {},
) {
  const [row] = await db
    .insert(activities)
    .values({ ownerId, title: content.title, slides: content.slides, settings: content.settings, ...opts })
    .returning({ id: activities.id });
  return row!.id;
}

export async function getActivityRow(id: string) {
  const [row] = await db.select().from(activities).where(eq(activities.id, id));
  return row ?? null;
}

export async function activitiesOf(ownerId: string) {
  return db.select().from(activities).where(eq(activities.ownerId, ownerId));
}

export async function findUser(email: string) {
  const [row] = await db.select().from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
  if (!row) return null;
  const tokens = await db.select({ purpose: loginTokens.purpose, expiresAt: loginTokens.expiresAt }).from(loginTokens).where(eq(loginTokens.userId, row.id));
  return { ...row, tokens };
}

export async function createTerm(term: string) {
  const [row] = await db.insert(moderationTerms).values({ lang: "it", term, match: "word" }).returning({ id: moderationTerms.id });
  return row!.id;
}

export async function findTermById(id: string) {
  const [row] = await db.select().from(moderationTerms).where(eq(moderationTerms.id, id));
  return row ?? null;
}

export async function findTerm(term: string) {
  const [row] = await db.select().from(moderationTerms).where(eq(moderationTerms.term, term));
  return row ?? null;
}

export const sampleActivity: ActivityContent = {
  title: "Comunicazione efficace",
  settings: DEFAULT_SETTINGS,
  slides: [
    { id: "intro", type: "content", title: "Benvenuti in aula", body: "Oggi parliamo di ascolto attivo.", notes: "Presentarsi" },
    {
      id: "q1",
      type: "choice",
      question: "Quanto ascolti gli altri?",
      multiple: false,
      options: [
        { id: "a", label: "Molto" },
        { id: "b", label: "Poco" },
      ],
    },
    { id: "q2", type: "open", question: "Cosa rende efficace una squadra?", maxAnswers: 2 },
    { id: "q3", type: "wordcloud", question: "Una parola sulla fiducia", maxEntries: 2 },
    { id: "q4", type: "scale", question: "Quanto sei d'accordo?", max: 5, statements: [{ id: "s1", label: "So ascoltare" }] },
  ],
};

/** Registra ogni richiesta del browser verso host diversi da localhost. */
export function trackThirdParty(target: Page | BrowserContext) {
  const offenders: string[] = [];
  target.on("request", (req: Request) => {
    const url = new URL(req.url());
    if (url.protocol === "data:" || url.protocol === "blob:") return;
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) offenders.push(req.url());
  });
  return offenders;
}
