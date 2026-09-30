"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { T } from "@arthur/shared";

export function VerifyButton({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "invalid">(token ? "idle" : "invalid");
  if (state === "invalid") {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="font-bold text-brand-ink">
          {T.auth.verifyInvalid}
        </p>
        <Link href="/login" className="btn self-start">
          {T.auth.loginTitle}
        </Link>
      </div>
    );
  }
  return (
    <button
      type="button"
      className="btn btn-primary"
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy");
        const res = await fetch("/api/auth/verifica", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        }).catch(() => null);
        if (res?.ok) router.replace("/attivita");
        else setState("invalid");
      }}
    >
      {T.auth.verifyButton}
    </button>
  );
}
