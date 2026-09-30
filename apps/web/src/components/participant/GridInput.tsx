"use client";
import { useId, useRef, useState } from "react";
import { LIMITS, T, type PublicInteractive } from "@arthur/shared";
import { SubmitButton, type SubmitFn } from "./SubmitButton";

type GridSlide = Extract<PublicInteractive, { type: "grid" }>;
type Pos = { x: number; y: number };

/**
 * Griglia 2x2: si sceglie l'elemento e lo si posiziona toccando la griglia.
 * Per tastiera e lettori di schermo ogni elemento ha due cursori (asse X e asse Y).
 * Coordinate 0–100; y = 100 in alto.
 */
export function GridInput({ slide, onSubmit, disabled }: { slide: GridSlide; onSubmit: SubmitFn; disabled: boolean }) {
  const [positions, setPositions] = useState<Record<string, Pos>>({});
  const [active, setActive] = useState(slide.items[0]!.id);
  const areaRef = useRef<HTMLDivElement>(null);
  const base = useId();
  const placed = slide.items.filter((i) => positions[i.id]).length;
  const complete = placed === slide.items.length;

  const place = (id: string, pos: Pos) => {
    setPositions((p) => ({ ...p, [id]: pos }));
    // Passa al primo elemento non ancora posizionato
    const next = slide.items.find((i) => i.id !== id && !positions[i.id]);
    if (next) setActive(next.id);
  };

  const onTap = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const r = areaRef.current!.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * LIMITS.gridMax);
    const y = Math.round((1 - (e.clientY - r.top) / r.height) * LIMITS.gridMax);
    place(active, { x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (complete) void onSubmit({ positions });
      }}
    >
      <p className="mb-3 text-muted">{T.participant.gridHint}</p>
      <fieldset disabled={disabled} className="mb-3">
        <legend className="label">{T.participant.gridItem}</legend>
        <div className="flex flex-wrap gap-2">
          {slide.items.map((it, i) => (
            <label
              key={it.id}
              className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-2 border-black px-3 font-bold has-[:focus-visible]:outline has-[:focus-visible]:outline-3 ${
                active === it.id ? "bg-black text-white" : ""
              }`}
            >
              <input type="radio" className="sr-only" name={`${base}-active`} checked={active === it.id} onChange={() => setActive(it.id)} />
              <span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-full bg-brand text-sm text-black">
                {i + 1}
              </span>
              {it.label}
              {positions[it.id] && <span aria-hidden="true">✓</span>}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="text-center text-sm font-bold">{slide.yAxis.max}</div>
      <div className="flex items-center gap-1">
        <span className="w-14 shrink-0 text-right text-xs font-bold [writing-mode:vertical-rl] rotate-180">{slide.xAxis.min}</span>
        <div
          ref={areaRef}
          onPointerDown={onTap}
          aria-hidden="true"
          className="relative aspect-square flex-1 touch-none select-none rounded-xl border-2 border-black bg-white"
        >
          <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
          <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
          {slide.items.map((it, i) => {
            const p = positions[it.id];
            if (!p) return null;
            return (
              <span
                key={it.id}
                className={`absolute grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-black text-sm font-bold ${
                  active === it.id ? "bg-black text-white" : "bg-brand text-black"
                }`}
                style={{ left: `${p.x}%`, top: `${100 - p.y}%` }}
              >
                {i + 1}
              </span>
            );
          })}
        </div>
        <span className="w-14 shrink-0 text-xs font-bold [writing-mode:vertical-rl] rotate-180">{slide.xAxis.max}</span>
      </div>
      <div className="text-center text-sm font-bold">{slide.yAxis.min}</div>

      <details className="mt-4">
        <summary className="cursor-pointer font-bold underline underline-offset-2">{T.participant.gridSliders}</summary>
        <fieldset disabled={disabled} className="mt-3 flex flex-col gap-4">
          {slide.items.map((it) => {
            const p = positions[it.id] ?? { x: 50, y: 50 };
            return (
              <fieldset key={it.id} className="rounded-xl border-2 border-line p-3">
                <legend className="px-1 font-bold">{it.label}</legend>
                <label className="block text-sm">
                  {T.participant.gridX("↔", slide.xAxis.min, slide.xAxis.max)}
                  <input type="range" min={0} max={100} value={p.x} className="w-full accent-brand" onChange={(e) => place(it.id, { ...p, x: Number(e.target.value) })} />
                </label>
                <label className="block text-sm">
                  {T.participant.gridX("↕", slide.yAxis.min, slide.yAxis.max)}
                  <input type="range" min={0} max={100} value={p.y} className="w-full accent-brand" onChange={(e) => place(it.id, { ...p, y: Number(e.target.value) })} />
                </label>
              </fieldset>
            );
          })}
        </fieldset>
      </details>
      <p className="mt-3 text-sm text-muted" aria-live="polite">
        {T.participant.gridPlaced(placed, slide.items.length)}
      </p>
      <SubmitButton disabled={disabled || !complete} />
    </form>
  );
}
