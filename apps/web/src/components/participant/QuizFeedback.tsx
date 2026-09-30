"use client";
import { useEffect, useState } from "react";
import { EV, T, type PublicInteractive, type QuizResultReply, type SessionState } from "@arthur/shared";
import type { Request } from "./ParticipantApp";

type QuizSlide = Extract<PublicInteractive, { type: "quiz" }>;

/** Esito personale del quiz, mostrato solo a risposte chiuse insieme alla soluzione. */
export function QuizFeedback({ slide, reveal, request }: { slide: QuizSlide; reveal: SessionState["reveal"]; request: Request }) {
  const [res, setRes] = useState<Extract<QuizResultReply, { ok: true }> | null>(null);
  useEffect(() => {
    let alive = true;
    void request<QuizResultReply>(EV.myResult, { slideId: slide.id }).then((r) => {
      if (alive && r?.ok) setRes(r);
    });
    return () => {
      alive = false;
    };
  }, [request, slide.id]);

  const solution =
    slide.mode === "single"
      ? slide.options.find((o) => o.id === reveal?.correctOptionId)?.label
      : reveal?.acceptedAnswers?.join(" · ");

  return (
    <div role="status" className="flex flex-col gap-3">
      {res && (
        <div className={`rounded-2xl p-5 text-center ${!res.answered ? "bg-soft" : res.correct ? "bg-black text-white" : "border-2 border-black"}`}>
          <p className="font-display text-2xl font-semibold">
            {!res.answered ? T.participant.quizNoAnswer : res.correct ? T.participant.quizCorrect : T.participant.quizWrong}
          </p>
          {res.answered && <p className="mt-1 text-xl font-bold">{T.participant.quizPoints(res.points)}</p>}
          <p className="mt-2 text-sm opacity-80">{T.participant.quizTotal(res.total)}</p>
        </div>
      )}
      {solution && (
        <p className="rounded-2xl bg-soft p-4">
          <span className="font-bold">{T.participant.quizSolution}:</span> {solution}
        </p>
      )}
    </div>
  );
}
