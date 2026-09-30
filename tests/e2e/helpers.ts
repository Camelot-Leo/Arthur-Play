import { DEFAULT_SETTINGS } from "@arthur/shared";
import type { BrowserContext, Page, Request } from "@playwright/test";
import { activities, authSessions, createDb, loginTokens, users } from "@arthur/db";
import type { ActivityContent } from "@arthur/shared";
import { randomToken, sha256 } from "@arthur/shared/server";

const { db, client } = createDb(process.env.DATABASE_URL, 2);
export const closeDb = () => client.end();

export async function createFacilitator() {
  const email = `facilitatore-${randomToken(6).toLowerCase()}@example.it`;
  const [user] = await db.insert(users).values({ email, name: "Facilitatore di prova", role: "facilitator" }).returning({ id: users.id });
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

export async function createActivity(ownerId: string, content: ActivityContent) {
  const [row] = await db
    .insert(activities)
    .values({ ownerId, title: content.title, slides: content.slides, settings: content.settings })
    .returning({ id: activities.id });
  return row!.id;
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
