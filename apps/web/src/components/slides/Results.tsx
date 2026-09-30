"use client";
import { T, type ChoiceResults, type PublicInteractive, type OpenResults, type ScaleResults, type SlideResults, type WordcloudResults } from "@arthur/shared";

type Variant = "projection" | "control";

const nf = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

export function Results(props: {
  slide: PublicInteractive;
  data: SlideResults | null;
  variant: Variant;
  onHide?: (itemId: string, hidden: boolean) => void;
}) {
  const { slide, data, variant } = props;
  if (!data) {
    return <p className="text-center text-2xl text-muted">{T.results.hidden}</p>;
  }
  if (data.respondents === 0) {
    return <p className={`text-center text-muted ${variant === "projection" ? "text-3xl" : "text-lg"}`}>{T.results.noAnswers}</p>;
  }
  switch (data.type) {
    case "choice":
      return slide.type === "choice" ? <ChoiceView slide={slide} data={data} variant={variant} /> : null;
    case "scale":
      return slide.type === "scale" ? <ScaleView slide={slide} data={data} variant={variant} /> : null;
    case "open":
      return <OpenView data={data} variant={variant} onHide={props.onHide} />;
    case "wordcloud":
      return <WordcloudView data={data} variant={variant} onHide={props.onHide} />;
  }
}

function ChoiceView({ slide, data, variant }: { slide: Extract<PublicInteractive, { type: "choice" }>; data: ChoiceResults; variant: Variant }) {
  const big = variant === "projection";
  return (
    <div>
      <ul className={`flex flex-col ${big ? "gap-5" : "gap-3"}`}>
        {slide.options.map((o) => {
          const c = data.counts[o.id] ?? 0;
          return (
            <li key={o.id}>
              <div className={`mb-1 flex items-baseline justify-between gap-4 font-bold ${big ? "text-[clamp(1.25rem,2vw,2.25rem)]" : "text-base"}`}>
                <span>{o.label}</span>
                <span className="tabular-nums">
                  {pct(c, data.respondents)}% <span className="font-normal text-muted">({c})</span>
                </span>
              </div>
              <div className={`w-full overflow-hidden rounded-full bg-soft ${big ? "h-8" : "h-4"}`} aria-hidden="true">
                <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${pct(c, data.respondents)}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className={`mt-4 text-muted ${big ? "text-xl" : "text-sm"}`}>{T.results.respondents(data.respondents)}</p>
    </div>
  );
}

function ScaleView({ slide, data, variant }: { slide: Extract<PublicInteractive, { type: "scale" }>; data: ScaleResults; variant: Variant }) {
  const big = variant === "projection";
  return (
    <div>
      <ul className={`grid gap-6 ${big && slide.statements.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
        {slide.statements.map((s) => {
          const st = data.stats[s.id] ?? { count: 0, avg: 0, dist: [] };
          const maxD = Math.max(1, ...st.dist);
          return (
            <li key={s.id} className="flex items-end gap-6">
              <div className="min-w-0 flex-1">
                <p className={`font-bold ${big ? "text-[clamp(1.25rem,1.8vw,2rem)]" : "text-base"}`}>{s.label}</p>
                <div className={`mt-2 flex items-end gap-1 ${big ? "h-32" : "h-16"}`} aria-hidden="true">
                  {st.dist.map((d, i) => (
                    <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                      <div className="w-full rounded-t bg-black transition-[height] duration-500" style={{ height: `${(d / maxD) * 100}%` }} />
                      <span className={`tabular-nums text-muted ${big ? "text-base" : "text-xs"}`}>{i + 1}</span>
                    </div>
                  ))}
                </div>
                <p className="sr-only">{st.dist.map((d, i) => `${i + 1}: ${d}`).join(", ")}</p>
              </div>
              <div className="text-center">
                <p className={`font-display font-semibold tabular-nums text-brand ${big ? "text-7xl" : "text-3xl"}`}>{nf.format(st.avg)}</p>
                <p className={`text-muted ${big ? "text-lg" : "text-xs"}`}>
                  {T.results.average} / {slide.max}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className={`mt-4 text-muted ${big ? "text-xl" : "text-sm"}`}>{T.results.respondents(data.respondents)}</p>
    </div>
  );
}

function HideButton({ label, hidden, onClick }: { label: string; hidden: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={hidden ? T.control.unhideLabel(label) : T.control.hideLabel(label)}
      aria-pressed={hidden}
      className="btn min-h-10 shrink-0 px-3 py-1 text-sm"
    >
      {hidden ? T.control.unhide : T.control.hide}
    </button>
  );
}

function OpenView({ data, variant, onHide }: { data: OpenResults; variant: Variant; onHide?: (id: string, hidden: boolean) => void }) {
  if (variant === "control") {
    return (
      <div>
        {data.filtered > 0 && <p className="mb-2 text-sm text-muted">{T.results.filtered(data.filtered)}</p>}
        <ul className="flex flex-col gap-2">
          {data.items.map((it) => (
            <li key={it.id} className={`flex items-start justify-between gap-3 rounded-xl border-2 p-3 ${it.hidden ? "border-line text-muted line-through" : "border-black"}`}>
              <span className="min-w-0 break-words">{it.text}</span>
              {onHide && <HideButton label={it.text} hidden={!!it.hidden} onClick={() => onHide(it.id, !it.hidden)} />}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <ul className="columns-1 gap-4 sm:columns-2 xl:columns-3">
      {data.items.map((it) => (
        <li key={it.id} className="animate-slide-in mb-4 break-inside-avoid rounded-2xl border-2 border-black p-4 text-[clamp(1.1rem,1.6vw,1.75rem)]">
          {it.text}
        </li>
      ))}
    </ul>
  );
}

function WordcloudView({ data, variant, onHide }: { data: WordcloudResults; variant: Variant; onHide?: (id: string, hidden: boolean) => void }) {
  if (variant === "control") {
    return (
      <div>
        {data.filtered > 0 && <p className="mb-2 text-sm text-muted">{T.results.filtered(data.filtered)}</p>}
        <ul className="flex flex-col gap-2">
          {data.words.map((w) => (
            <li key={w.word} className={`flex items-center justify-between gap-3 rounded-xl border-2 p-2 pl-3 ${w.hidden ? "border-line text-muted line-through" : "border-black"}`}>
              <span className="min-w-0 break-words">
                {w.word} <span className="text-muted">({w.count})</span>
              </span>
              {onHide && <HideButton label={w.word} hidden={!!w.hidden} onClick={() => onHide(w.word, !w.hidden)} />}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const max = Math.max(1, ...data.words.map((w) => w.count));
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2" aria-label={T.slideTypes.wordcloud}>
      {data.words.map((w, i) => {
        const size = 1.25 + (w.count / max) * 4;
        // Rosso solo per il testo grande (≥ 24 px), dove il contrasto 3,6:1 è sufficiente (WCAG AA).
        return (
          <li
            key={w.word}
            className={`animate-slide-in font-display font-semibold leading-tight ${i % 3 === 0 && size >= 1.5 ? "text-brand" : "text-black"}`}
            style={{ fontSize: `${size}rem` }}
          >
            {w.word}
            <span className="sr-only"> ({T.results.votes(w.count)})</span>
          </li>
        );
      })}
    </ul>
  );
}
