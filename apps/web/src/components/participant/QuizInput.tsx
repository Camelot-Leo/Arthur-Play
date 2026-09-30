"use client";
import { useId, useState } from "react";
import { LIMITS, T, type PublicInteractive } from "@arthur/shared";
import { SubmitButton, type SubmitFn } from "./SubmitButton";

type QuizSlide = Extract<PublicInteractive, { type: "quiz" }>;

/** Quiz: scelta singola o risposta scritta. La soluzione non è nota al browser finché le risposte sono aperte. */
export function QuizInput({ slide, onSubmit, disabled }: { slide: QuizSlide; onSubmit: SubmitFn; disabled: boolean }) {
  const [choice, setChoice] = useState("");
  const [text, setText] = useState("");
  const id = useId();
  if (slide.mode === "text") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) void onSubmit({ text: text.trim() });
        }}
      >
        <label htmlFor={id} className="label">
          {T.participant.quizTextLabel}
        </label>
        <input id={id} className="input" maxLength={LIMITS.quizAnswerMax} autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} disabled={disabled} />
        <SubmitButton disabled={disabled || !text.trim()} />
      </form>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (choice) void onSubmit({ optionId: choice });
      }}
    >
      <fieldset disabled={disabled}>
        <legend className="mb-3 text-muted">{T.participant.chooseOne}</legend>
        <div className="grid grid-cols-1 gap-3">
          {slide.options.map((o) => (
            <label
              key={o.id}
              className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border-2 border-black px-4 py-3 text-lg font-bold has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 ${
                choice === o.id ? "bg-black text-white" : ""
              }`}
            >
              <input type="radio" name={id} className="h-5 w-5 accent-brand" checked={choice === o.id} onChange={() => setChoice(o.id)} />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>
      <SubmitButton disabled={disabled || !choice} />
    </form>
  );
}
