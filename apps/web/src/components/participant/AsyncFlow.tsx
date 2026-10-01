"use client";
import { useState } from "react";
import { T, type Answer, type PublicSlide, type QuizFeedbackData } from "@arthur/shared";
import { ContentSlideView, SlideHeading } from "@/components/slides/SlideParts";
import { AnswerInput } from "./Inputs";
import type { Request } from "./ParticipantApp";
import { QaPanel } from "./QaPanel";

type Submit = (slideId: string, answer: Answer) => Promise<{ ok: boolean; answered?: number; feedback?: QuizFeedbackData }>;

const maxFor = (s: PublicSlide) => (s.type === "open" ? s.maxAnswers : 1);

/**
 * Modalità a ritmo libero: il partecipante avanza da solo tra le slide. Il server conosce solo
 * quali slide questo token ha già inviato (blocco dei doppi invii), niente altro.
 */
export function AsyncFlow(props: {
  slides: PublicSlide[];
  answered: Record<string, number>;
  submit: Submit;
  request: Request;
  sending: boolean;
  error: string;
}) {
  const { slides, answered } = props;
  // Si riparte dalla prima slide interattiva non ancora completata.
  const firstOpen = slides.findIndex((s) => s.type !== "content" && (answered[s.id] ?? 0) < maxFor(s));
  const [index, setIndex] = useState(() => (firstOpen === -1 ? slides.length : Math.max(0, firstOpen)));
  const [feedback, setFeedback] = useState<Record<string, QuizFeedbackData>>({});

  if (index >= slides.length) {
    return (
      <section role="status" className="animate-slide-in flex flex-col gap-4">
        <h1 className="text-3xl font-semibold">{T.async.done}</h1>
        <p className="text-muted">{T.async.doneHint}</p>
        <button type="button" className="btn self-start" onClick={() => setIndex(0)}>
          {T.async.review}
        </button>
      </section>
    );
  }

  const slide = slides[index]!;
  const count = answered[slide.id] ?? 0;
  const done = count >= maxFor(slide);
  const fb = feedback[slide.id];

  const onSubmit = async (answer: Answer) => {
    const r = await props.submit(slide.id, answer);
    if (r.ok && r.feedback) setFeedback((f) => ({ ...f, [slide.id]: r.feedback! }));
    return r.ok;
  };

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label={T.async.progress(index + 1, slides.length)} className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-muted">{T.async.progress(index + 1, slides.length)}</p>
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-soft"
          role="progressbar"
          aria-label={T.async.progress(index + 1, slides.length)}
          aria-valuemin={1}
          aria-valuemax={slides.length}
          aria-valuenow={index + 1}
        >
          <div className="h-full bg-brand" style={{ width: `${((index + 1) / slides.length) * 100}%` }} />
        </div>
      </nav>

      <section key={slide.id} className="animate-slide-in flex flex-col gap-5" aria-labelledby="domanda">
        {slide.type === "content" ? (
          <ContentSlideView slide={slide} size="participant" />
        ) : slide.type === "qa" ? (
          <>
            <SlideHeading slide={slide} size="participant" id="domanda" />
            <QaPanel slideId={slide.id} locked={false} request={props.request} liveItems={null} />
          </>
        ) : (
          <>
            <SlideHeading slide={slide} size="participant" id="domanda" />
            {fb ? (
              <QuizExplanation slide={slide} feedback={fb} />
            ) : done ? (
              <p role="status" className="rounded-2xl bg-black p-4 text-lg font-bold text-white">
                {T.participant.sent}
              </p>
            ) : (
              <>
                {count > 0 && (
                  <p role="status" className="rounded-2xl bg-soft p-4 font-bold">
                    {T.participant.sent} {T.participant.answersLeft(maxFor(slide) - count)}
                  </p>
                )}
                <AnswerInput slide={slide} onSubmit={onSubmit} disabled={props.sending} />
              </>
            )}
            {props.error && !done && (
              <p role="alert" className="font-bold text-brand-ink">
                {props.error}
              </p>
            )}
          </>
        )}
      </section>

      <div className="flex justify-between gap-3">
        <button type="button" className="btn" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
          ← {T.async.prev}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => setIndex((i) => i + 1)}>
          {slide.type !== "content" && !done && slide.type !== "qa" ? T.async.skip : T.async.next} →
        </button>
      </div>
    </div>
  );
}

/** Riscontro immediato del quiz con soluzione e spiegazione. */
function QuizExplanation({ slide, feedback }: { slide: PublicSlide; feedback: QuizFeedbackData }) {
  const solution =
    slide.type === "quiz" && slide.mode === "single"
      ? slide.options.find((o) => o.id === feedback.correctOptionId)?.label
      : feedback.acceptedAnswers?.join(" · ");
  return (
    <div role="status" className="flex flex-col gap-3">
      <p className={`rounded-2xl p-5 text-center font-display text-2xl font-semibold ${feedback.correct ? "bg-black text-white" : "border-2 border-black"}`}>
        {feedback.correct ? T.participant.quizCorrect : T.participant.quizWrong}
      </p>
      {solution && (
        <p className="rounded-2xl bg-soft p-4">
          <span className="font-bold">{T.participant.quizSolution}:</span> {solution}
        </p>
      )}
      {feedback.explanation && (
        <p className="rounded-2xl border-2 border-line p-4">
          <span className="font-bold">{T.async.explanation}:</span> {feedback.explanation}
        </p>
      )}
    </div>
  );
}
