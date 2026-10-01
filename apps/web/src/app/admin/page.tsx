import Link from "next/link";
import { asc, moderationTerms, users } from "@arthur/db";
import { T } from "@arthur/shared";
import { Footer } from "@/components/Footer";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/services";
import { InviteForm, ModerationLists } from "./AdminForms";

export const dynamic = "force-dynamic";

/** Pannello admin: inviti, libreria condivisa, liste del filtro di moderazione. Non esiste per gli altri ruoli (404). */
export default async function AdminPage() {
  const admin = await requireAdmin();
  const [accounts, terms] = await Promise.all([
    db().select({ id: users.id, name: users.name, email: users.email, role: users.role, disabledAt: users.disabledAt }).from(users).orderBy(asc(users.name)),
    db().select({ id: moderationTerms.id, lang: moderationTerms.lang, term: moderationTerms.term, match: moderationTerms.match }).from(moderationTerms).orderBy(asc(moderationTerms.term)),
  ]);
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col">
      <header className="flex items-center justify-between gap-4 px-4 pt-6">
        <Link href="/attivita" className="underline underline-offset-2">
          {T.app.back}
        </Link>
        <span className="text-sm text-muted">{admin.name}</span>
      </header>
      <main id="contenuto" className="flex flex-1 flex-col gap-10 px-4 py-8">
        <h1 className="text-3xl font-semibold">{T.admin.title}</h1>

        <section aria-labelledby="facilitatori" className="flex flex-col gap-4">
          <h2 id="facilitatori" className="text-2xl font-semibold">
            {T.admin.users}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left">
              <thead>
                <tr className="border-b-2 border-black">
                  <th scope="col" className="py-2 pr-4">{T.admin.name}</th>
                  <th scope="col" className="py-2 pr-4">{T.admin.email}</th>
                  <th scope="col" className="py-2 pr-4">{T.admin.role}</th>
                  <th scope="col" className="py-2">{T.admin.status}</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((u) => (
                  <tr key={u.id} className="border-b border-line">
                    <td className="py-2 pr-4">{u.name}</td>
                    <td className="py-2 pr-4 break-all">{u.email}</td>
                    <td className="py-2 pr-4">{T.admin.roles[u.role]}</td>
                    <td className="py-2">{u.disabledAt ? T.admin.disabled : T.admin.active}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <InviteForm />
        </section>

        <section aria-labelledby="libreria" className="flex flex-col gap-3">
          <h2 id="libreria" className="text-2xl font-semibold">
            {T.admin.library}
          </h2>
          <p>{T.admin.libraryHint}</p>
          <Link href="/attivita?libreria=condivisa" className="btn self-start">
            {T.admin.openLibrary}
          </Link>
        </section>

        <section aria-labelledby="moderazione" className="flex flex-col gap-4">
          <h2 id="moderazione" className="text-2xl font-semibold">
            {T.admin.moderation}
          </h2>
          <p className="max-w-prose text-sm text-muted">{T.admin.moderationHint}</p>
          <ModerationLists initial={terms} />
        </section>
      </main>
      <Footer />
    </div>
  );
}
