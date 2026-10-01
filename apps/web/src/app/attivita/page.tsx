import Link from "next/link";
import { T } from "@arthur/shared";
import { listUserSessions } from "@arthur/shared/server";
import { Footer } from "@/components/Footer";
import { listOwned } from "@/lib/server/activities";
import { ai } from "@/lib/server/ai";
import { requireUser } from "@/lib/server/auth";
import { redis } from "@/lib/server/services";
import { LogoutButton, NewActivityButton, StartAsyncButton, StartButton } from "./ActivityActions";

export const dynamic = "force-dynamic";

const formatDate = (ms: number) =>
  new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Rome" }).format(new Date(ms));

export default async function ActivitiesPage() {
  const user = await requireUser();
  const [items, sessions] = await Promise.all([listOwned(user.id), listUserSessions(redis(), user.id)]);
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col">
      <header className="flex items-center justify-between gap-4 px-4 pt-6">
        <p className="font-display text-xl font-semibold">{T.app.name}</p>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted">{user.name}</span>
          <LogoutButton />
        </div>
      </header>
      <main id="contenuto" className="flex-1 px-4 py-8">
        {sessions.length > 0 && (
          <section aria-labelledby="sessioni" className="mb-10">
            <h2 id="sessioni" className="mb-3 text-2xl font-semibold">
              {T.activities.activeSessions}
            </h2>
            <ul className="flex flex-col gap-3">
              {sessions.map((s) => (
                <li key={s.sid} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                  <span>
                    <strong>{s.title}</strong> · {s.mode === "async" ? T.async.mode : T.async.live} · {T.control.code}{" "}
                    <span className="font-mono">{s.code}</span>
                    {s.mode === "async" && <span className="text-sm text-muted"> · {T.async.expiresOn(formatDate(s.expiresAt))}</span>}
                  </span>
                  <Link className="btn btn-dark" href={`/regia/${s.sid}`}>
                    {T.activities.openControl}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold">{T.activities.title}</h1>
          <div className="flex flex-wrap gap-2">
            {ai().enabled && (
              <Link className="btn" href="/attivita/genera">
                ✨ {T.ai.generate}
              </Link>
            )}
            <NewActivityButton />
          </div>
        </div>
        {items.length === 0 ? (
          <p className="text-muted">{T.activities.empty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((a) => (
              <li key={a.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-lg font-bold">{a.title}</p>
                  <p className="text-sm text-muted">{T.activities.slides(a.slides.length)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link className="btn" href={`/attivita/${a.id}`}>
                    {T.activities.edit}
                  </Link>
                  <StartButton activityId={a.id} />
                  <StartAsyncButton activityId={a.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
      <Footer />
    </div>
  );
}
