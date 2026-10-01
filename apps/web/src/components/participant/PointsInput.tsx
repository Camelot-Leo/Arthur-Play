"use client";
import { useId, useState } from "react";
import { LIMITS, T, type PublicInteractive } from "@arthur/shared";
import { SubmitButton, type SubmitFn } from "./SubmitButton";

type PointsSlide = Extract<PublicInteractive, { type: "points" }>;

/** 100 punti: il pulsante di invio si attiva solo quando il totale è esattamente 100. */
export function PointsInput({ slide, onSubmit, disabled }: { slide: PointsSlide; onSubmit: SubmitFn; disabled: boolean }) {
  const [points, setPoints] = useState<Record<string, number>>({});
  const base = useId();
  const used = Object.values(points).reduce((a, v) => a + v, 0);
  const left = LIMITS.pointsTotal - used;
  const set = (id: string, v: number) => setPoints((p) => ({ ...p, [id]: Math.max(0, Math.min(LIMITS.pointsTotal, Math.round(v) || 0)) }));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (left === 0) void onSubmit({ points });
      }}
    >
      <p className="mb-3 text-muted">{T.participant.pointsHint}</p>
      <fieldset disabled={disabled} className="flex flex-col gap-3">
        {slide.options.map((o) => {
          const v = points[o.id] ?? 0;
          return (
            <div key={o.id} className="rounded-2xl border-2 border-black p-3">
              <label htmlFor={`${base}-${o.id}`} className="font-bold">
                {o.label}
              </label>
              <div className="mt-2 flex items-center gap-2">
                <button type="button" className="btn min-h-11 w-11 p-0" aria-label={`${T.participant.pointsFor(o.label)} −10`} onClick={() => set(o.id, v - 10)}>
                  −
                </button>
                <input
                  id={`${base}-${o.id}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={LIMITS.pointsTotal}
                  step={1}
                  className="input w-24 text-center"
                  value={v}
                  onChange={(e) => set(o.id, Number(e.target.value))}
                />
                <button type="button" className="btn min-h-11 w-11 p-0" aria-label={`${T.participant.pointsFor(o.label)} +10`} onClick={() => set(o.id, v + Math.min(10, Math.max(left, 0)))}>
                  +
                </button>
              </div>
            </div>
          );
        })}
      </fieldset>
      <p className={`mt-3 font-bold ${left < 0 ? "text-brand-ink" : ""}`} aria-live="polite">
        {T.participant.pointsLeft(left)}
      </p>
      <SubmitButton disabled={disabled || left !== 0} />
    </form>
  );
}
