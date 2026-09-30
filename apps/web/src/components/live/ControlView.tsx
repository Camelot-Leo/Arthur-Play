"use client";
import Link from "next/link";
import { useState } from "react";
import { EV, LIMITS, T, isInteractive, toPublicSlide, type InteractiveSlide, type PublicInteractive, type Slide } from "@arthur/shared";
import { Footer } from "@/components/Footer";
import { QrCode } from "@/components/QrCode";
import { TimerBadge } from "@/components/Timer";
import { Results } from "@/components/slides/Results";
import { ContentSlideView, SlideHeading } from "@/components/slides/SlideParts";
import { downloadResultPng } from "@/lib/client/download-png";
import { useLiveSession } from "@/lib/client/useLiveSession";
import { formatCode } from "./format";

const FACTORS = [1, 1.5, 2] as const;

/** Vista Regia: controlli del facilitatore, anteprima della slide successiva, note. */
export function ControlView({ sid, joinBase }: { sid: string; joinBase: string }) {
  const live = useLiveSession(sid, "control");
  const [busy, setBusy] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(60);
  const run = async (event: string, payload?: unknown) => {
    setBusy(true);
    await live.send(event, payload);
    setBusy(false);
  };

  if (live.ended) {
    return (
      <main id="contenuto" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-4">
        <h1 className="text-3xl font-semibold">{T.control.ended}</h1>
        <Link href="/attivita" className="btn self-start">
          {T.control.backToActivities}
        </Link>
      </main>
    );
  }

  const { activity, state } = live;
  const index = state?.index ?? 0;
  const current: Slide | undefined = activity?.slides[index];
  const next: Slide | undefined = activity?.slides[index + 1];
  const joinUrl = live.code ? `${joinBase}/g/${live.code}` : "";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-black px-4 py-3">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold">
            {T.control.title}
            {activity && <span className="font-normal text-muted"> · {activity.title}</span>}
          </h1>
          <p>
            {T.control.code} <strong className="font-mono text-xl">{formatCode(live.code)}</strong>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p aria-live="polite" className="font-bold">
            {T.control.participants(live.participants)}
          </p>
          <p className={`text-sm ${live.connected ? "text-ok" : "font-bold text-brand-ink"}`}>
            {live.connected ? T.control.connected : T.control.disconnected}
          </p>
          <a href={`/proiezione/${sid}`} target="_blank" rel="noopener" className="btn">
            {T.control.openProjection}
          </a>
          <button
            type="button"
            className="btn btn-dark"
            onClick={() => {
              if (window.confirm(T.control.closeConfirm)) void run(EV.close);
            }}
          >
            {T.control.close}
          </button>
        </div>
      </header>

      <main id="contenuto" className="grid flex-1 gap-6 p-4 lg:grid-cols-[2fr_1fr]">
        <section aria-labelledby="slide-attuale" className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id="slide-attuale" className="text-sm font-bold uppercase tracking-wide text-muted">
              {T.control.current} · {state && T.control.slideOf(index + 1, state.total)}
            </h2>
            {state && <TimerBadge timerEnd={state.timerEnd} now={state.now} />}
          </div>
          <div className="card min-h-64 p-5">
            {current && (current.type === "content" ? <ContentSlideView slide={current} size="compact" /> : <SlideHeading slide={current} size="compact" />)}
            {current && isInteractive(current) && (
              <div className="mt-5">
                <Results
                  slide={current}
                  data={live.results?.slideId === current.id ? live.results.data : null}
                  variant="control"
                  onHide={(itemId, hidden) => void live.send(EV.hide, { slideId: current.id, itemId, hidden })}
                  qaControls={{ onMark: (qid, answered) => void live.send(EV.qaMark, { slideId: current.id, qid, answered }) }}
                  solution={current.type === "quiz" ? { correctOptionId: current.correctOptionId, acceptedAnswers: current.acceptedAnswers } : null}
                />
              </div>
            )}
            {current && isInteractive(current) && live.results?.slideId === current.id && live.results.data && (
              <button
                type="button"
                className="btn mt-5 min-h-10 px-3 text-sm"
                onClick={() =>
                  void downloadResultPng({
                    slide: toPublicSlide(current) as PublicInteractive,
                    data: live.results!.data!,
                    solution: current.type === "quiz" ? { correctOptionId: current.correctOptionId, acceptedAnswers: current.acceptedAnswers } : null,
                    filename: `risultato-slide-${index + 1}.png`,
                  })
                }
              >
                {T.results.downloadPng}
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label={T.control.title}>
            <button type="button" className="btn" disabled={busy || index === 0} onClick={() => run(EV.goto, { index: index - 1 })}>
              ← {T.control.prev}
            </button>
            <button type="button" className="btn btn-primary" disabled={busy || !next} onClick={() => run(EV.goto, { index: index + 1 })}>
              {T.control.next} →
            </button>
            {current && isInteractive(current) && state && (
              <>
                <button type="button" className="btn" aria-pressed={!state.resultsVisible} onClick={() => run(EV.showResults, { visible: !state.resultsVisible })}>
                  {state.resultsVisible ? T.control.hideResults : T.control.showResults}
                </button>
                <button type="button" className="btn" aria-pressed={state.locked} onClick={() => run(EV.lock, { locked: !state.locked })}>
                  {state.locked ? T.control.unlock : T.control.lock}
                </button>
              </>
            )}
          </div>

          {current && isInteractive(current) && state && (
            <fieldset className="flex flex-wrap items-end gap-2">
              <legend className="label">{T.control.timer}</legend>
              <form
                className="flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(EV.timer, { seconds: timerSeconds });
                }}
              >
                <label className="text-sm">
                  {T.control.timerSeconds}
                  <input
                    type="number"
                    className="input mt-1 w-28 text-base"
                    min={LIMITS.timerMinSeconds}
                    max={LIMITS.timerMaxSeconds}
                    step={1}
                    value={timerSeconds}
                    onChange={(e) => setTimerSeconds(Math.round(Number(e.target.value)))}
                  />
                </label>
                <button
                  type="submit"
                  className="btn min-h-12 px-3 text-sm"
                  disabled={!(timerSeconds >= LIMITS.timerMinSeconds && timerSeconds <= LIMITS.timerMaxSeconds)}
                >
                  {T.control.timerGo}
                </button>
              </form>
              {state.timerEnd && (
                <>
                  <button type="button" className="btn min-h-10 px-3 text-sm" onClick={() => run(EV.timerAdd, { seconds: 30 })}>
                    {T.control.timerAdd}
                  </button>
                  <button type="button" className="btn min-h-10 px-3 text-sm" onClick={() => run(EV.timer, { seconds: null })}>
                    {T.control.timerStop}
                  </button>
                </>
              )}
            </fieldset>
          )}

          {state && activity?.slides.some((s) => s.type === "quiz") && (
            <fieldset className="flex flex-wrap items-center gap-4 rounded-xl border-2 border-line p-3">
              <legend className="px-1 font-bold">{T.control.quizTimer}</legend>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-brand"
                  checked={state.quizTimer.enabled}
                  onChange={(e) => run(EV.quizTimer, { enabled: e.target.checked, factor: state.quizTimer.factor })}
                />
                {state.quizTimer.enabled ? T.control.quizTimerOn : T.control.quizTimerOff}
              </label>
              <label className="flex items-center gap-2">
                {T.control.quizTimerFactor}
                <select
                  className="input w-36 text-base"
                  value={state.quizTimer.factor}
                  disabled={!state.quizTimer.enabled}
                  onChange={(e) => run(EV.quizTimer, { enabled: state.quizTimer.enabled, factor: Number(e.target.value) })}
                >
                  {FACTORS.map((f) => (
                    <option key={f} value={f}>
                      {T.control.factor(f)}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
          )}
        </section>

        <aside className="flex flex-col gap-6">
          <section aria-labelledby="note">
            <h2 id="note" className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">
              {T.control.notes}
            </h2>
            <p className="whitespace-pre-line rounded-xl bg-soft p-4">{current?.notes || T.control.noNotes}</p>
          </section>
          <section aria-labelledby="successiva">
            <h2 id="successiva" className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">
              {T.control.nextSlide}
            </h2>
            <div className="card p-4">{next ? <SlideHeading slide={next} size="compact" /> : <p className="text-muted">{T.control.noNext}</p>}</div>
          </section>
          {activity && (
            <nav aria-label={T.control.slideOf(index + 1, activity.slides.length)}>
              <ol className="flex flex-col gap-1">
                {activity.slides.map((s, i) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-current={i === index ? "step" : undefined}
                      aria-label={T.control.goTo(i + 1)}
                      className={`flex-1 rounded-lg px-3 py-2 text-left ${i === index ? "bg-black text-white" : "hover:bg-soft"}`}
                      onClick={() => run(EV.goto, { index: i })}
                    >
                      {i + 1}. {s.type === "content" ? s.title : (s as InteractiveSlide).question}
                    </button>
                    {isInteractive(s) && i !== index && (
                      <button type="button" className="btn min-h-9 px-2 text-xs" onClick={() => run(EV.reopen, { index: i })}>
                        {T.control.reopen}
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          )}
          {joinUrl && <QrCode value={joinUrl} label={T.projection.qrAlt(joinUrl)} className="h-40 w-40" />}
        </aside>
      </main>
      <Footer />
    </div>
  );
}
