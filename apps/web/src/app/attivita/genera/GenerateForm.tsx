"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { T } from "@arthur/shared";

export function GenerateForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const file = form.get("file");
        if (!String(form.get("topic") ?? "").trim() && !(file instanceof File && file.size > 0)) return setError(T.ai.needInput);
        setError("");
        setBusy(true);
        const res = await fetch("/api/ai/genera", { method: "POST", body: form }).catch(() => null);
        const body = (await res?.json().catch(() => null)) as { id?: string; error?: string } | null;
        if (body?.id) router.push(`/attivita/${body.id}`);
        else {
          setBusy(false);
          setError(T.ai.errors[body?.error ?? "ai_error"] ?? T.ai.errors.ai_error!);
        }
      }}
    >
      <div>
        <label htmlFor="topic" className="label">
          {T.ai.topic}
        </label>
        <textarea id="topic" name="topic" className="input min-h-24" maxLength={500} placeholder={T.ai.topicPlaceholder} disabled={busy} />
      </div>
      <div>
        <label htmlFor="file" className="label">
          {T.ai.document}
        </label>
        <input id="file" name="file" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={busy} />
      </div>
      <fieldset>
        <legend className="label">{T.ai.audience}</legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input type="radio" name="audience" value="studenti" defaultChecked className="h-5 w-5 accent-brand" disabled={busy} />
            {T.ai.audienceStudents}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="audience" value="docenti" className="h-5 w-5 accent-brand" disabled={busy} />
            {T.ai.audienceTeachers}
          </label>
        </div>
      </fieldset>
      <div>
        <label htmlFor="slideCount" className="label">
          {T.ai.slideCount}
        </label>
        <input id="slideCount" name="slideCount" type="number" min={3} max={20} defaultValue={8} className="input max-w-32" disabled={busy} />
      </div>
      <button type="submit" className="btn btn-primary self-start" disabled={busy}>
        {T.ai.submit}
      </button>
      <div aria-live="polite">
        {busy && <p role="status">{T.ai.working}</p>}
        {error && (
          <p role="alert" className="font-bold text-brand-ink">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
