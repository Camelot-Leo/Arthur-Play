"use client";
import { useState } from "react";
import { EV, T, type ResultsMessage } from "@arthur/shared";
import { ThemesView } from "@/components/slides/ThemesView";

const MIN = 10;

/** Numero di risposte visibili (le nascoste non contano e non vengono mai inviate all'AI). */
function visibleCount(r: ResultsMessage | null): number {
  const d = r?.data;
  if (!d) return 0;
  if (d.type === "open") return d.items.filter((i) => !i.hidden).length;
  if (d.type === "wordcloud") return d.words.filter((w) => !w.hidden).reduce((a, w) => a + w.count, 0);
  return 0;
}

export function ThemesPanel(props: {
  sid: string;
  slideId: string;
  results: ResultsMessage | null;
  visible: boolean;
  send: (event: string, payload?: unknown) => Promise<{ ok: boolean } | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const count = visibleCount(props.results);
  const themes = props.results?.themes;
  return (
    <div className="mt-5 flex flex-col gap-3 rounded-xl border-2 border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn min-h-10 px-3 text-sm"
          disabled={busy || count < MIN}
          onClick={async () => {
            setBusy(true);
            setError("");
            const res = await fetch(`/api/sessioni/${encodeURIComponent(props.sid)}/temi`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ slideId: props.slideId }),
            }).catch(() => null);
            const body = (await res?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
            if (body?.ok) await props.send(EV.themes, { slideId: props.slideId, visible: true });
            else setError(T.ai.errors[body?.error ?? "ai_error"] ?? T.ai.errors.ai_error!);
            setBusy(false);
          }}
        >
          ✨ {busy ? T.ai.themesWorking : T.ai.themes}
        </button>
        {themes && (
          <button
            type="button"
            className="btn min-h-10 px-3 text-sm"
            aria-pressed={props.visible}
            onClick={() => props.send(EV.themes, { slideId: props.slideId, visible: !props.visible })}
          >
            {props.visible ? T.ai.themesHide : T.ai.themesShow}
          </button>
        )}
        {count < MIN && <span className="text-sm text-muted">{T.ai.themesNeed(MIN)}</span>}
      </div>
      <div aria-live="polite">
        {error && <p className="font-bold text-brand-ink">{error}</p>}
      </div>
      {themes && <ThemesView themes={themes} size="compact" />}
    </div>
  );
}
