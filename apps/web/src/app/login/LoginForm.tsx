"use client";
import { useState } from "react";
import { T } from "@arthur/shared";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setStatus("sending");
        const res = await fetch("/api/auth/richiesta", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email }),
        }).catch(() => null);
        if (res?.ok) return setStatus("sent");
        const body = (await res?.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error === "rate_limited" ? T.errors.rate_limited : T.errors.generic);
        setStatus("error");
      }}
    >
      <div>
        <label htmlFor="email" className="label">
          {T.auth.emailLabel}
        </label>
        <input id="email" type="email" className="input" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary" disabled={status === "sending"}>
        {T.auth.sendLink}
      </button>
      <div aria-live="polite">
        {status === "sent" && <p className="rounded-xl bg-soft p-4">{T.auth.linkSent}</p>}
        {status === "error" && <p className="font-bold text-brand-ink">{error}</p>}
      </div>
    </form>
  );
}
