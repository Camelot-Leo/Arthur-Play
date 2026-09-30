"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { T } from "@arthur/shared";

export function CodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const clean = code.replace(/\D/g, "");
        if (clean.length !== 6) return setError(true);
        router.push(`/g/${clean}`);
      }}
    >
      <div>
        <label htmlFor="codice" className="label">
          {T.home.codeLabel}
        </label>
        <input
          id="codice"
          className="input text-center font-display text-4xl tracking-[0.3em]"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(false);
          }}
          aria-describedby={`codice-hint${error ? " codice-err" : ""}`}
          aria-invalid={error}
          autoFocus
        />
        <p id="codice-hint" className="mt-1 text-sm text-muted">
          {T.home.codeHint}
        </p>
        {error && (
          <p id="codice-err" role="alert" className="mt-1 font-bold text-brand-ink">
            {T.home.codeInvalid}
          </p>
        )}
      </div>
      <button type="submit" className="btn btn-primary text-lg">
        {T.home.enter}
      </button>
    </form>
  );
}
