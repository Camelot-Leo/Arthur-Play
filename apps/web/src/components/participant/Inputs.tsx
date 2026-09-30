"use client";
import { useId, useState } from "react";
import { LIMITS, T, type PublicInteractive } from "@arthur/shared";
import { GridInput } from "./GridInput";
import { SubmitButton, type SubmitFn } from "./SubmitButton";
import { PointsInput } from "./PointsInput";
import { QuizInput } from "./QuizInput";
import { RankingInput } from "./RankingInput";

export type { SubmitFn };

/** Campo di risposta del partecipante in base al tipo di slide. */
export function AnswerInput({ slide, onSubmit, disabled }: { slide: PublicInteractive; onSubmit: SubmitFn; disabled: boolean }) {
  switch (slide.type) {
    case "choice":
      return <ChoiceInput key={slide.id} slide={slide} onSubmit={onSubmit} disabled={disabled} />;
    case "scale":
      return <ScaleInput key={slide.id} slide={slide} onSubmit={onSubmit} disabled={disabled} />;
    case "open":
      return <OpenInput key={slide.id} onSubmit={onSubmit} disabled={disabled} />;
    case "wordcloud":
      return <WordcloudInput key={slide.id} slide={slide} onSubmit={onSubmit} disabled={disabled} />;
    case "grid":
      return <GridInput key={slide.id} slide={slide} onSubmit={onSubmit} disabled={disabled} />;
    case "ranking":
      return <RankingInput key={slide.id} slide={slide} onSubmit={onSubmit} disabled={disabled} />;
    case "points":
      return <PointsInput key={slide.id} slide={slide} onSubmit={onSubmit} disabled={disabled} />;
    case "quiz":
      return <QuizInput key={slide.id} slide={slide} onSubmit={onSubmit} disabled={disabled} />;
    case "qa":
      // Il Q&A ha un pannello dedicato (QaPanel) con domande e voti.
      return null;
  }
}


function ChoiceInput({ slide, onSubmit, disabled }: { slide: Extract<PublicInteractive, { type: "choice" }>; onSubmit: SubmitFn; disabled: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);
  const name = useId();
  const toggle = (id: string) =>
    setSelected((cur) => (slide.multiple ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id]));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (selected.length) void onSubmit({ optionIds: selected });
      }}
    >
      <fieldset disabled={disabled}>
        <legend className="mb-3 text-muted">{slide.multiple ? T.participant.chooseMany : T.participant.chooseOne}</legend>
        <div className="flex flex-col gap-3">
          {slide.options.map((o) => {
            const checked = selected.includes(o.id);
            return (
              <label
                key={o.id}
                className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 border-black px-4 py-3 text-lg font-bold has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 ${
                  checked ? "bg-black text-white" : "bg-white"
                }`}
              >
                <input
                  type={slide.multiple ? "checkbox" : "radio"}
                  name={name}
                  value={o.id}
                  checked={checked}
                  onChange={() => toggle(o.id)}
                  className="h-5 w-5 accent-brand"
                />
                {o.label}
              </label>
            );
          })}
        </div>
      </fieldset>
      <SubmitButton disabled={disabled || selected.length === 0} />
    </form>
  );
}

function ScaleInput({ slide, onSubmit, disabled }: { slide: Extract<PublicInteractive, { type: "scale" }>; onSubmit: SubmitFn; disabled: boolean }) {
  const [values, setValues] = useState<Record<string, number>>({});
  const base = useId();
  const complete = slide.statements.every((s) => values[s.id]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (complete) void onSubmit({ values });
      }}
    >
      <fieldset disabled={disabled} className="flex flex-col gap-6">
        {slide.statements.map((s) => (
          <fieldset key={s.id}>
            <legend className="mb-2 text-lg font-bold">{s.label}</legend>
            <div className={`grid gap-2 ${slide.max === 10 ? "grid-cols-5" : "grid-cols-5"}`}>
              {Array.from({ length: slide.max }, (_, i) => i + 1).map((v) => {
                const checked = values[s.id] === v;
                return (
                  <label
                    key={v}
                    className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border-2 border-black text-lg font-bold has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 ${
                      checked ? "bg-black text-white" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      className="sr-only"
                      name={`${base}-${s.id}`}
                      value={v}
                      checked={checked}
                      onChange={() => setValues((cur) => ({ ...cur, [s.id]: v }))}
                      aria-label={T.participant.scaleValue(v, slide.max)}
                    />
                    {v}
                  </label>
                );
              })}
            </div>
            {(slide.minLabel || slide.maxLabel) && (
              <div className="mt-1 flex justify-between text-sm text-muted">
                <span>1 {slide.minLabel && `· ${slide.minLabel}`}</span>
                <span>
                  {slide.max} {slide.maxLabel && `· ${slide.maxLabel}`}
                </span>
              </div>
            )}
          </fieldset>
        ))}
      </fieldset>
      <SubmitButton disabled={disabled || !complete} />
    </form>
  );
}

function OpenInput({ onSubmit, disabled }: { onSubmit: SubmitFn; disabled: boolean }) {
  const [text, setText] = useState("");
  const id = useId();
  const left = LIMITS.openAnswerMax - text.length;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const t = text.trim();
        if (t && (await onSubmit({ text: t }))) setText("");
      }}
    >
      <label htmlFor={id} className="label">
        {T.participant.yourAnswer}
      </label>
      <textarea
        id={id}
        className="input min-h-32"
        maxLength={LIMITS.openAnswerMax}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
        aria-describedby={`${id}-count`}
      />
      <p id={`${id}-count`} className="mt-1 text-sm text-muted" aria-live="polite">
        {T.participant.charsLeft(left)}
      </p>
      <SubmitButton disabled={disabled || !text.trim()} />
    </form>
  );
}

function WordcloudInput({ slide, onSubmit, disabled }: { slide: Extract<PublicInteractive, { type: "wordcloud" }>; onSubmit: SubmitFn; disabled: boolean }) {
  const [words, setWords] = useState<string[]>(() => Array.from({ length: slide.maxEntries }, () => ""));
  const base = useId();
  const filled = words.map((w) => w.trim()).filter(Boolean);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (filled.length) void onSubmit({ words: filled });
      }}
    >
      <fieldset disabled={disabled} className="flex flex-col gap-3">
        {words.map((w, i) => (
          <div key={i}>
            <label htmlFor={`${base}-${i}`} className="sr-only">
              {T.participant.wordPlaceholder(i + 1)}
            </label>
            <input
              id={`${base}-${i}`}
              className="input"
              maxLength={LIMITS.wordMax}
              placeholder={T.participant.wordPlaceholder(i + 1)}
              value={w}
              autoComplete="off"
              onChange={(e) => setWords((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))}
            />
          </div>
        ))}
      </fieldset>
      <SubmitButton disabled={disabled || filled.length === 0} />
    </form>
  );
}
