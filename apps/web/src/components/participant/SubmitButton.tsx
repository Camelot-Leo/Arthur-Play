"use client";
import { T, type Answer } from "@arthur/shared";

export type SubmitFn = (answer: Answer) => Promise<boolean>;

export function SubmitButton({ disabled }: { disabled: boolean }) {
  return (
    <button type="submit" className="btn btn-primary mt-6 w-full text-lg" disabled={disabled}>
      {T.participant.send}
    </button>
  );
}
