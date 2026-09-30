"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { T } from "@arthur/shared";

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
