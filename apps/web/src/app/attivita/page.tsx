import Link from "next/link";
import { AUDIENCES, T, type Audience, type Library } from "@arthur/shared";
import { listUserSessions } from "@arthur/shared/server";
import { Footer } from "@/components/Footer";
import { libraryTags, listLibrary } from "@/lib/server/activities";
import { ai } from "@/lib/server/ai";
import { requireUser } from "@/lib/server/auth";
import { redis } from "@/lib/server/services";
import { DuplicateButton, ImportButton, LibraryButton, LogoutButton, NewActivityButton, StartAsyncButton, StartButton } from "./ActivityActions";

export const dynamic = "force-dynamic";

const formatDate = (ms: number) =>
  new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Rome" }).format(new Date(ms));

type Search = { libreria?: string; destinatari?: string; tag?: string };

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const q = await searchParams;
  const library: Library = q.libreria === "condivisa" ? "shared" : "personal";
  const audience = AUDIENCES.includes(q.destinatari as Audience) ? (q.destinatari as Audience) : undefined;
  const tag = q.tag?.trim().toLowerCase().slice(0, 30) || undefined;
  const filtered = !!(audience || tag);
  const [items, tags, sessions] = await Promise.all([
    listLibrary(user, library, { audience, tag }),
    libraryTags(user, library),
    listUserSessions(redis(), user.id),
  ]);
  const isAdmin = user.role === "admin";
  const tabClass = (on: boolean) => `rounded-full px-4 py-2 font-bold ${on ? "bg-black text-white" : "underline underline-offset-2"}`;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 px-4 pt-6">
        <p className="font-display text-xl font-semibold">{T.app.name}</p>
        <div className="flex items-center gap-3 text-sm">
          {isAdmin && (
            <Link href="/admin" className="underline underline-offset-2">
              {T.activities.admin}
            </Link>
          )}
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

        <nav aria-label={T.activities.libraryNav} className="mb-6 flex flex-wrap gap-2">
          <Link href="/attivita" className={tabClass(library === "personal")} aria-current={library === "personal" ? "page" : undefined}>
            {T.activities.personal}
          </Link>
          <Link href="/attivita?libreria=condivisa" className={tabClass(library === "shared")} aria-current={library === "shared" ? "page" : undefined}>
            {T.activities.shared}
          </Link>
        </nav>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold">{library === "shared" ? T.activities.shared : T.activities.title}</h1>
          {library === "personal" && (
            <div className="flex flex-wrap gap-2">
              {ai().enabled && (
                <Link className="btn" href="/attivita/genera">
                  ✨ {T.ai.generate}
                </Link>
              )}
              <ImportButton />
              <NewActivityButton />
            </div>
          )}
        </div>

        <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-xl bg-soft p-3" aria-label={T.activities.filters}>
          {library === "shared" && <input type="hidden" name="libreria" value="condivisa" />}
          <div>
            <label htmlFor="f-destinatari" className="label">
              {T.activities.filterAudience}
            </label>
            <select id="f-destinatari" name="destinatari" className="input" defaultValue={audience ?? ""}>
              <option value="">{T.activities.all}</option>
              {AUDIENCES.map((a) => (
                <option key={a} value={a}>
                  {T.activities.audience[a]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-tag" className="label">
              {T.activities.filterTag}
            </label>
            <select id="f-tag" name="tag" className="input" defaultValue={tag ?? ""}>
              <option value="">{T.activities.all}</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-dark">
            {T.activities.applyFilters}
          </button>
          {filtered && (
            <Link href={library === "shared" ? "/attivita?libreria=condivisa" : "/attivita"} className="btn">
              {T.activities.resetFilters}
            </Link>
          )}
        </form>

        {items.length === 0 ? (
          <p className="text-muted">{filtered ? T.activities.noMatch : library === "shared" ? T.activities.sharedEmpty : T.activities.empty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((a) => {
              const editable = a.library === "shared" ? isAdmin : a.ownerId === user.id;
              return (
                <li key={a.id} className="card flex flex-col gap-3 p-4">
                  <div>
                    <p className="text-lg font-bold">{a.title}</p>
                    <p className="text-sm text-muted">
                      {T.activities.slides(a.slides.length)} · {T.activities.audience[a.audience]}
                      {a.tags.length > 0 && <> · {a.tags.map((t) => `#${t}`).join(" ")}</>}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {editable && (
                      <Link className="btn" href={`/attivita/${a.id}`}>
                        {T.activities.edit}
                      </Link>
                    )}
                    <StartButton activityId={a.id} />
                    <StartAsyncButton activityId={a.id} />
                    <DuplicateButton activityId={a.id} />
                    <a className="btn" href={`/api/attivita/${a.id}/esporta`} download>
                      {T.activities.exportJson}
                    </a>
                    {isAdmin && a.library === "personal" && <LibraryButton activityId={a.id} target="shared" />}
                    {isAdmin && a.library === "shared" && <LibraryButton activityId={a.id} target="personal" />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
      <Footer />
    </div>
  );
}
