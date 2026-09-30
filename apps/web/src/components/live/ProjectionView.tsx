"use client";
import { T, type PublicInteractive, type PublicSlide } from "@arthur/shared";
import { Footer } from "@/components/Footer";
import { QrCode } from "@/components/QrCode";
import { TimerBadge } from "@/components/Timer";
import { Results } from "@/components/slides/Results";
import { ContentSlideView, SlideHeading } from "@/components/slides/SlideParts";
import { useLiveSession } from "@/lib/client/useLiveSession";
import { formatCode, hostOf } from "./format";

const interactive = (s: PublicSlide): s is PublicInteractive => s.type !== "content";

/** Vista Proiezione: schermo grande 16:9, leggibile da fondo aula. */
export function ProjectionView({ sid, joinBase }: { sid: string; joinBase: string }) {
  const live = useLiveSession(sid, "projection");
  const joinUrl = live.code ? `${joinBase}/g/${live.code}` : "";

  if (live.ended) {
    return (
      <main id="contenuto" className="flex h-dvh items-center justify-center">
        <h1 className="text-6xl font-semibold">{T.projection.ended}</h1>
      </main>
    );
  }

  const slide = live.state?.slide;
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-white">
      <header className="flex items-center justify-between gap-6 border-b-4 border-black px-[3vw] py-3">
        <div className="flex items-center gap-5">
          {joinUrl && <QrCode value={joinUrl} label={T.projection.qrAlt(joinUrl)} className="h-[min(9vw,8rem)] w-[min(9vw,8rem)] shrink-0" />}
          <p className="text-[clamp(1rem,1.8vw,2rem)] leading-tight">
            {T.projection.joinAt} <strong>{hostOf(joinBase)}</strong>
            <br />
            {T.projection.withCode}{" "}
            <strong className="font-display text-[clamp(1.75rem,3.5vw,4rem)] tracking-wider">{formatCode(live.code)}</strong>
          </p>
        </div>
        <div className="flex items-center gap-6">
          {live.state && <TimerBadge timerEnd={live.state.timerEnd} now={live.state.now} large />}
          <p className="text-[clamp(1rem,1.6vw,1.75rem)] font-bold" aria-live="polite">
            {T.projection.participants(live.participants)}
          </p>
        </div>
      </header>
      <main id="contenuto" className="min-h-0 flex-1 overflow-hidden px-[4vw] py-[3vh]">
        {slide && (
          <div key={slide.id} className="animate-slide-in flex h-full flex-col gap-[3vh]">
            {slide.type === "content" ? (
              <ContentSlideView slide={slide} size="projection" />
            ) : (
              <>
                <SlideHeading slide={slide} size="projection" />
                {interactive(slide) && (
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <Results
                      slide={slide}
                      data={live.results?.slideId === slide.id ? live.results.data : null}
                      hidden={!live.state?.resultsVisible}
                      solution={live.state?.reveal}
                      variant="projection"
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>
      <Footer className="py-1 text-xs" />
    </div>
  );
}

