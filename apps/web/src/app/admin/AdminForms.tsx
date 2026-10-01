"use client";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { T } from "@arthur/shared";

async function send(url: string, method: "POST" | "DELETE", body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  return { status: res?.status ?? 0, body: (await res?.json().catch(() => null)) as { ok?: boolean; id?: string; error?: string } | null };
}

/** Invito di un facilitatore (o di un altro admin): link di accesso valido 7 giorni. */
export function InviteForm() {
  const router = useRouter();
  const id = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"facilitator" | "admin">("facilitator");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      noValidate
      className="card flex flex-col gap-3 p-4"
      aria-labelledby={`${id}-t`}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setMsg({ ok: false, text: T.admin.invalid });
        setBusy(true);
        const res = await send("/api/admin/inviti", "POST", { name, email, role });
        setBusy(false);
        if (res.body?.ok) {
          setMsg({ ok: true, text: T.admin.invited(email.trim().toLowerCase()) });
          setName("");
          setEmail("");
          router.refresh();
        } else setMsg({ ok: false, text: res.body?.error === "exists" ? T.admin.exists : res.body?.error === "invalid" ? T.admin.invalid : T.errors.generic });
      }}
    >
      <h3 id={`${id}-t`} className="text-xl font-semibold">
        {T.admin.inviteTitle}
      </h3>
      <p className="text-sm text-muted">{T.admin.inviteHint}</p>
      <div className="flex flex-wrap gap-3">
        <div className="min-w-48 flex-1">
          <label htmlFor={`${id}-n`} className="label">
            {T.admin.name}
          </label>
          <input id={`${id}-n`} className="input" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </div>
        <div className="min-w-48 flex-1">
          <label htmlFor={`${id}-e`} className="label">
            {T.admin.email}
          </label>
          <input id={`${id}-e`} type="email" className="input" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </div>
        <div>
          <label htmlFor={`${id}-r`} className="label">
            {T.admin.role}
          </label>
          <select id={`${id}-r`} className="input" value={role} onChange={(e) => setRole(e.target.value as "facilitator" | "admin")}>
            <option value="facilitator">{T.admin.roles.facilitator}</option>
            <option value="admin">{T.admin.roles.admin}</option>
          </select>
        </div>
      </div>
      <button type="submit" className="btn btn-primary self-start" disabled={busy}>
        {T.admin.invite}
      </button>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "font-bold" : "font-bold text-brand-ink"}>
          {msg.text}
        </p>
      )}
    </form>
  );
}

type Term = { id: string; lang: "it" | "en"; term: string; match: "word" | "contains" };

/** Liste del filtro di moderazione (italiano e inglese): aggiunta e rimozione dei termini. */
export function ModerationLists({ initial }: { initial: Term[] }) {
  const id = useId();
  const [terms, setTerms] = useState(initial);
  const [lang, setLang] = useState<"it" | "en">("it");
  const [term, setTerm] = useState("");
  const [match, setMatch] = useState<"word" | "contains" | "">("");
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return terms.filter((t) => t.lang === lang && (!q || t.term.includes(q)));
  }, [terms, lang, query]);
  // Default suggerito: "contiene" da 5 caratteri, "parola intera" per i termini corti.
  const effectiveMatch = match || (term.trim().length >= 5 ? "contains" : "word");

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label={T.admin.lang} className="flex gap-2">
        {(["it", "en"] as const).map((l) => (
          <label key={l} className={`btn cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 ${lang === l ? "btn-dark" : ""}`}>
            <input type="radio" className="sr-only" name={`${id}-lang`} checked={lang === l} onChange={() => setLang(l)} />
            {T.admin.langs[l]} ({terms.filter((t) => t.lang === l).length})
          </label>
        ))}
      </div>
      <form
        noValidate
        className="card flex flex-wrap items-end gap-3 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const value = term.trim().toLowerCase();
          if (value.length < 2 || value.length > 50) return setMsg({ ok: false, text: T.admin.termInvalid });
          const res = await send("/api/admin/moderazione", "POST", { lang, term: value, match: effectiveMatch });
          if (res.body?.id) {
            setTerms((all) => [...all, { id: res.body!.id!, lang, term: value, match: effectiveMatch }].sort((a, b) => a.term.localeCompare(b.term)));
            setTerm("");
            setMatch("");
            setMsg({ ok: true, text: `${T.admin.addTerm}: ${value}` });
          } else setMsg({ ok: false, text: res.body?.error === "exists" ? T.admin.termExists : T.admin.termInvalid });
        }}
      >
        <div className="min-w-48 flex-1">
          <label htmlFor={`${id}-t`} className="label">
            {T.admin.term} ({T.admin.langs[lang]})
          </label>
          <input id={`${id}-t`} className="input" maxLength={50} value={term} onChange={(e) => setTerm(e.target.value)} autoComplete="off" />
        </div>
        <div>
          <label htmlFor={`${id}-m`} className="label">
            {T.admin.match}
          </label>
          <select id={`${id}-m`} className="input" value={effectiveMatch} onChange={(e) => setMatch(e.target.value as "word" | "contains")}>
            <option value="contains">{T.admin.matches.contains}</option>
            <option value="word">{T.admin.matches.word}</option>
          </select>
        </div>
        <button type="submit" className="btn btn-primary">
          {T.admin.addTerm}
        </button>
        {msg && (
          <p role={msg.ok ? "status" : "alert"} className={`w-full font-bold ${msg.ok ? "" : "text-brand-ink"}`}>
            {msg.text}
          </p>
        )}
      </form>
      <div>
        <label htmlFor={`${id}-q`} className="label">
          {T.admin.search}
        </label>
        <input id={`${id}-q`} type="search" className="input max-w-sm" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
        <p className="mt-1 text-sm text-muted" aria-live="polite">
          {T.admin.terms(shown.length)}
        </p>
      </div>
      <ul className="flex flex-wrap gap-2">
        {shown.map((t) => (
          <li key={t.id} className="flex items-center gap-1 rounded-full border-2 border-black py-1 pl-3 pr-1">
            <span>{t.term}</span>
            <span className="text-xs text-muted">· {T.admin.matches[t.match]}</span>
            <button
              type="button"
              className="ml-1 flex h-8 w-8 items-center justify-center rounded-full hover:bg-soft"
              aria-label={T.admin.removeTerm(t.term)}
              onClick={async () => {
                const res = await send(`/api/admin/moderazione/${t.id}`, "DELETE");
                if (res.body?.ok) setTerms((all) => all.filter((x) => x.id !== t.id));
                else setMsg({ ok: false, text: T.errors.generic });
              }}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
