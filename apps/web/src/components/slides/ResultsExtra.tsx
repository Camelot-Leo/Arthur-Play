"use client";
import {
  T,
  type GridResults,
  type PointsResults,
  type PublicInteractive,
  type QaResults,
  type QuizResults,
  type RankingResults,
} from "@arthur/shared";

type Variant = "projection" | "control";
type Of<K extends PublicInteractive["type"]> = Extract<PublicInteractive, { type: K }>;

const nf = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });
const big = (v: Variant) => v === "projection";
const Respondents = ({ n, variant }: { n: number; variant: Variant }) => (
  <p className={`mt-4 text-muted ${big(variant) ? "text-xl" : "text-sm"}`}>{T.results.respondents(n)}</p>
);

/** Griglia 2x2: punto medio di ogni elemento. Elenco testuale equivalente per i lettori di schermo. */
export function GridView({ slide, data, variant }: { slide: Of<"grid">; data: GridResults; variant: Variant }) {
  const b = big(variant);
  return (
    <div className={`flex ${b ? "h-full gap-8" : "flex-col gap-3"}`}>
      <div className={`flex flex-col ${b ? "aspect-square h-full max-h-[58vh]" : "w-full max-w-sm"}`}>
        <p className={`text-center font-bold ${b ? "text-xl" : "text-sm"}`}>{slide.yAxis.max}</p>
        <div className="flex flex-1 items-stretch gap-2">
          <p className={`self-center font-bold [writing-mode:vertical-rl] rotate-180 ${b ? "text-xl" : "text-xs"}`}>{slide.xAxis.min}</p>
          <div className="relative aspect-square flex-1 rounded-xl border-2 border-black" aria-hidden="true">
            <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
            <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
            {slide.items.map((it, i) => {
              const p = data.points[it.id];
              if (!p?.count) return null;
              return (
                <span
                  key={it.id}
                  className={`absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-black bg-brand font-bold text-black transition-all duration-500 ${
                    b ? "h-12 w-12 text-xl" : "h-7 w-7 text-sm"
                  }`}
                  style={{ left: `${p.x}%`, top: `${100 - p.y}%` }}
                >
                  {i + 1}
                </span>
              );
            })}
          </div>
          <p className={`self-center font-bold [writing-mode:vertical-rl] rotate-180 ${b ? "text-xl" : "text-xs"}`}>{slide.xAxis.max}</p>
        </div>
        <p className={`text-center font-bold ${b ? "text-xl" : "text-sm"}`}>{slide.yAxis.min}</p>
      </div>
      <div>
        <ol className={`flex flex-col ${b ? "gap-3 text-[clamp(1.1rem,1.6vw,1.75rem)]" : "gap-1 text-sm"}`}>
          {slide.items.map((it, i) => {
            const p = data.points[it.id] ?? { x: 0, y: 0, count: 0 };
            return (
              <li key={it.id} className="flex items-center gap-3">
                <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand font-bold leading-none text-black">
                  {i + 1}
                </span>
                <span>
                  <span className="font-bold">{it.label}</span>
                  <span className="sr-only">: {T.results.gridPoint(it.label, nf.format(p.x), nf.format(p.y))}</span>
                </span>
              </li>
            );
          })}
        </ol>
        <Respondents n={data.respondents} variant={variant} />
      </div>
    </div>
  );
}

/** Ranking: opzioni ordinate per posizione media (1 = prima). */
export function RankingView({ slide, data, variant }: { slide: Of<"ranking">; data: RankingResults; variant: Variant }) {
  const b = big(variant);
  const sorted = [...slide.options].sort((x, y) => (data.avgRank[x.id] ?? 0) - (data.avgRank[y.id] ?? 0));
  const n = slide.options.length;
  return (
    <div>
      <ol className={`flex flex-col ${b ? "gap-4" : "gap-2"}`}>
        {sorted.map((o, i) => {
          const avg = data.avgRank[o.id] ?? n;
          return (
            <li key={o.id} className="flex items-center gap-4">
              <span className={`shrink-0 font-display font-semibold ${b ? "w-16 text-5xl" : "w-8 text-xl"} ${i === 0 ? "text-brand" : ""}`}>{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className={`flex justify-between gap-3 font-bold ${b ? "text-[clamp(1.25rem,2vw,2.25rem)]" : ""}`}>
                  <span>{o.label}</span>
                  <span className={`font-normal text-muted ${b ? "text-xl" : "text-sm"}`}>{T.results.avgPosition(nf.format(avg))}</span>
                </div>
                <div className={`mt-1 w-full rounded-full bg-soft ${b ? "h-5" : "h-3"}`} aria-hidden="true">
                  <div className="h-full rounded-full bg-black transition-[width] duration-500" style={{ width: `${((n - avg + 1) / n) * 100}%` }} />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <Respondents n={data.respondents} variant={variant} />
    </div>
  );
}

/** 100 punti: media dei punti assegnati a ogni opzione. */
export function PointsView({ slide, data, variant }: { slide: Of<"points">; data: PointsResults; variant: Variant }) {
  const b = big(variant);
  const sorted = [...slide.options].sort((x, y) => (data.avg[y.id] ?? 0) - (data.avg[x.id] ?? 0));
  return (
    <div>
      <ul className={`flex flex-col ${b ? "gap-5" : "gap-3"}`}>
        {sorted.map((o) => {
          const v = data.avg[o.id] ?? 0;
          return (
            <li key={o.id}>
              <div className={`mb-1 flex justify-between gap-4 font-bold ${b ? "text-[clamp(1.25rem,2vw,2.25rem)]" : ""}`}>
                <span>{o.label}</span>
                <span className="tabular-nums">{T.results.avgPoints(nf.format(v))}</span>
              </div>
              <div className={`w-full rounded-full bg-soft ${b ? "h-8" : "h-4"}`} aria-hidden="true">
                <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${v}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <Respondents n={data.respondents} variant={variant} />
    </div>
  );
}

export type QaControls = { onMark: (qid: string, answered: boolean) => void };

/** Q&A: domande ordinate per voti; le risposte date scendono in fondo. */
export function QaView(props: { data: QaResults; variant: Variant; controls?: QaControls; onHide?: (id: string, hidden: boolean) => void }) {
  const { data, variant } = props;
  const b = big(variant);
  return (
    <div>
      {variant === "control" && data.filtered > 0 && <p className="mb-2 text-sm text-muted">{T.results.filtered(data.filtered)}</p>}
      <ul className={`flex flex-col ${b ? "gap-3" : "gap-2"}`}>
        {data.items.slice(0, b ? 8 : undefined).map((q) => (
          <li
            key={q.id}
            className={`flex items-start gap-4 rounded-2xl border-2 ${b ? "p-4" : "p-3"} ${q.answered || q.hidden ? "border-line text-muted" : "border-black"} ${q.hidden ? "line-through" : ""}`}
          >
            <span className={`flex shrink-0 flex-col items-center font-bold tabular-nums ${b ? "min-w-16 text-3xl" : "min-w-10 text-lg"}`}>
              <span aria-hidden="true" className="text-brand">
                ▲
              </span>
              {q.votes}
              <span className="sr-only">{T.results.votes(q.votes)}</span>
            </span>
            <div className="min-w-0 flex-1">
              <p className={`break-words ${b ? "text-[clamp(1.1rem,1.8vw,2rem)]" : ""}`}>{q.text}</p>
              {q.answered && <p className={`font-bold ${b ? "text-lg" : "text-sm"}`}>{T.results.qaAnswered}</p>}
            </div>
            {variant === "control" && (
              <div className="flex shrink-0 flex-col gap-1">
                {props.controls && (
                  <button
                    type="button"
                    className="btn min-h-10 px-3 py-1 text-sm"
                    aria-pressed={q.answered}
                    aria-label={q.answered ? T.control.qaUnmarkLabel(q.text) : T.control.qaMarkLabel(q.text)}
                    onClick={() => props.controls!.onMark(q.id, !q.answered)}
                  >
                    {q.answered ? T.control.qaUnmark : T.control.qaMark}
                  </button>
                )}
                {props.onHide && (
                  <button
                    type="button"
                    className="btn min-h-10 px-3 py-1 text-sm"
                    aria-pressed={!!q.hidden}
                    aria-label={q.hidden ? T.control.unhideLabel(q.text) : T.control.hideLabel(q.text)}
                    onClick={() => props.onHide!(q.id, !q.hidden)}
                  >
                    {q.hidden ? T.control.unhide : T.control.hide}
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Quiz: a risposte aperte la Proiezione mostra solo quante risposte sono arrivate;
 * a risposte chiuse mostra distribuzione e soluzione. La Regia vede sempre tutto.
 */
export function QuizView(props: {
  slide: Of<"quiz">;
  data: QuizResults;
  variant: Variant;
  solution: { correctOptionId?: string; acceptedAnswers?: string[] } | null;
}) {
  const { slide, data, variant, solution } = props;
  const b = big(variant);
  const show = variant === "control" || data.revealed;
  if (!show) {
    return (
      <p className="text-center font-display text-[clamp(2rem,5vw,5rem)] font-semibold" aria-live="off">
        {T.results.quizAnswers(data.respondents)}
      </p>
    );
  }
  return (
    <div>
      {slide.mode === "single" ? (
        <ul className={`grid gap-4 ${b ? "grid-cols-2" : "grid-cols-1"}`}>
          {slide.options.map((o) => {
            const c = data.counts[o.id] ?? 0;
            const correct = solution?.correctOptionId === o.id;
            return (
              <li
                key={o.id}
                className={`flex items-center justify-between gap-3 rounded-2xl border-2 ${b ? "p-5 text-[clamp(1.25rem,2vw,2.25rem)]" : "p-3"} ${
                  correct ? "border-black bg-black text-white" : "border-line text-muted"
                }`}
              >
                <span className="font-bold">
                  {correct && <span aria-hidden="true">✓ </span>}
                  {o.label}
                  {correct && <span className="sr-only"> ({T.editor.quizCorrect})</span>}
                </span>
                <span className="font-display font-semibold tabular-nums">{c}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        solution?.acceptedAnswers && (
          <p className={b ? "text-[clamp(1.25rem,2vw,2.25rem)]" : ""}>
            <span className="font-bold">{T.results.quizAccepted}:</span> {solution.acceptedAnswers.join(" · ")}
          </p>
        )
      )}
      <p className={`mt-4 font-bold ${b ? "text-2xl" : ""}`}>{T.results.quizCorrect(data.correct, data.respondents)}</p>
    </div>
  );
}
