"use client";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ASYNC_SESSION_MAX_SECONDS, LIMITS, T } from "@arthur/shared";

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  return (await res?.json().catch(() => null)) as Record<string, string> | null;
}

export function NewActivityButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-primary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await post("/api/attivita");
        if (res?.id) router.push(`/attivita/${res.id}`);
        else setBusy(false);
      }}
    >
      {T.activities.new}
    </button>
  );
}

export function StartButton({ activityId }: { activityId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <button
        type="button"
        className="btn btn-dark"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await post("/api/sessioni", { activityId });
          if (res?.sid) router.push(`/regia/${res.sid}`);
          else {
            setBusy(false);
            setError(res?.error === "rate_limited" ? T.errors.rate_limited : T.errors.generic);
          }
        }}
      >
        {T.activities.start}
      </button>
      {error && (
        <p role="alert" className="w-full font-bold text-brand-ink">
          {error}
        </p>
      )}
    </>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="underline underline-offset-2"
      onClick={async () => {
        await post("/api/auth/esci");
        router.replace("/login");
        router.refresh();
      }}
    >
      {T.auth.logout}
    </button>
  );
}

/** Valore per <input type="datetime-local"> nell'ora locale del browser. */
const toLocalInput = (ms: number) => {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Avvio a ritmo libero con scadenza scelta dal facilitatore (max 14 giorni). */
export function StartAsyncButton({ activityId }: { activityId: string }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [limits] = useState(() => {
    const now = Date.now();
    return {
      min: toLocalInput(now + LIMITS.asyncMinMinutes * 60_000),
      max: toLocalInput(now + ASYNC_SESSION_MAX_SECONDS * 1000 - 60_000),
      def: toLocalInput(now + 7 * 86_400_000),
    };
  });
  const [value, setValue] = useState(limits.def);
  if (!open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        {T.async.start}
      </button>
    );
  }
  return (
    <form
      noValidate
      className="flex w-full flex-wrap items-end gap-2 rounded-xl bg-soft p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        // Validazione nostra (messaggio sempre in italiano); il server ricontrolla comunque.
        const expiresAt = new Date(value).getTime();
        const now = Date.now();
        if (!(expiresAt >= now + LIMITS.asyncMinMinutes * 60_000 - 60_000 && expiresAt <= now + ASYNC_SESSION_MAX_SECONDS * 1000)) {
          return setError(T.async.deadlineInvalid);
        }
        setBusy(true);
        const res = await post("/api/sessioni", { activityId, mode: "async", expiresAt });
        if (res?.sid) router.push(`/regia/${res.sid}`);
        else {
          setBusy(false);
          setError(res?.error === "rate_limited" ? T.errors.rate_limited : T.async.deadlineInvalid);
        }
      }}
    >
      <label htmlFor={id} className="w-full font-bold">
        {T.async.deadline}
      </label>
      <input
        id={id}
        type="datetime-local"
        className="input w-auto"
        min={limits.min}
        max={limits.max}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-describedby={`${id}-hint`}
        required
      />
      <button type="submit" className="btn btn-dark" disabled={busy}>
        {T.async.confirm}
      </button>
      <button type="button" className="btn" onClick={() => setOpen(false)}>
        {T.async.cancel}
      </button>
      <p id={`${id}-hint`} className="w-full text-sm text-muted">
        {T.async.deadlineHint}
      </p>
      {error && (
        <p role="alert" className="w-full font-bold text-brand-ink">
          {error}
        </p>
      )}
    </form>
  );
}
