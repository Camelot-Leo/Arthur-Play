"use client";
import { useEffect, useRef, useState } from "react";
import { T, type PublicInteractive, type PublicSlide } from "@arthur/shared";
import { Footer } from "@/components/Footer";
import { QrCode } from "@/components/QrCode";
import { TimerBadge } from "@/components/Timer";
import { Celebration } from "@/components/game/Celebration";
import { Leaderboard } from "@/components/game/Leaderboard";
import { MissionBar } from "@/components/game/MissionBar";
import { Podium } from "@/components/game/Podium";
import { Results } from "@/components/slides/Results";
import { ContentSlideView, SlideHeading } from "@/components/slides/SlideParts";
import { sounds, unlockAudio } from "@/lib/client/sounds";
import { useLiveSession, type LiveSession } from "@/lib/client/useLiveSession";
import { formatCode, hostOf } from "./format";

const interactive = (s: PublicSlide): s is PublicInteractive => s.type !== "content";

/**
 * Feedback visivi e sonori della Proiezione: suoni solo se attivi dalla Regia e dopo il
 * clic su "Attiva i suoni" (richiesto dai browser); festeggiamento a missione compiuta.
 */
function useFeedback(live: LiveSession, audioOn: boolean) {
  const [celebrate, setCelebrate] = useState(false);
  const prev = useRef({ index: -1, locked: false, reveal: false, completed: false, view: "slide", respondents: 0, lastTick: 0 });
  const st = live.state;
  const respondents = live.results?.data?.respondents ?? 0;

  useEffect(() => {
    if (!st) return;
    const p = prev.current;
    const play = audioOn && st.sounds;
    const completed = !!st.mission?.completed;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (p.index !== -1) {
      if (play && st.index !== p.index) sounds.whoosh();
      else if (play && st.reveal && !p.reveal) sounds.reveal();
      else if (play && st.locked && !p.locked) sounds.timeUp();
      if (completed && !p.completed) {
        if (play) sounds.fanfare();
        timers.push(setTimeout(() => setCelebrate(true), 0), setTimeout(() => setCelebrate(false), 4000));
      }
      if (play && st.view === "podium" && p.view !== "podium") sounds.fanfare();
      if (st.index === p.index && respondents > p.respondents && Date.now() - p.lastTick > 300) {
        if (play) sounds.tick();
        p.lastTick = Date.now();
      }
    }
    prev.current = { ...p, index: st.index, locked: st.locked, reveal: !!st.reveal, completed, view: st.view, respondents };
    return () => timers.forEach(clearTimeout);
  }, [st, respondents, audioOn]);

  return celebrate;
}

/** Vista Proiezione: schermo grande 16:9, leggibile da fondo aula. */
export function ProjectionView({ sid, joinBase }: { sid: string; joinBase: string }) {
  const live = useLiveSession(sid, "projection");
  const [audioOn, setAudioOn] = useState(false);
  const celebrate = useFeedback(live, audioOn);
  const joinUrl = live.code ? `${joinBase}/g/${live.code}` : "";

  if (live.ended) {
    return (
      <main id="contenuto" className="flex h-dvh items-center justify-center">
        <h1 className="text-6xl font-semibold">{T.projection.ended}</h1>
      </main>
    );
  }

  const state = live.state;
  const slide = state?.slide;
  const view = state?.view ?? "slide";
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
          {state?.sounds && !audioOn && (
            <button type="button" className="btn text-sm" onClick={async () => setAudioOn(await unlockAudio())}>
              🔊 {T.game.enableSounds}
            </button>
          )}
          {state && <TimerBadge timerEnd={state.timerEnd} now={state.now} large />}
          <p key={live.participants} className="pulse-once text-[clamp(1rem,1.6vw,1.75rem)] font-bold" aria-live="polite">
            {T.projection.participants(live.participants)}
          </p>
        </div>
      </header>
      <main id="contenuto" className="min-h-0 flex-1 overflow-hidden px-[4vw] py-[3vh]">
        {view === "podium" && live.board?.teams ? (
          <Podium teams={live.board.teams} />
        ) : view === "leaderboard" && live.board ? (
          <Leaderboard board={live.board} />
        ) : (
          slide && (
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
                        hidden={!state?.resultsVisible}
                        solution={state?.reveal}
                        variant="projection"
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )
        )}
      </main>
      {state?.mission && (
        <div className="border-t-2 border-black px-[4vw] py-3">
          <MissionBar mission={state.mission} size="large" />
        </div>
      )}
      {celebrate && <Celebration />}
      <Footer className="py-1 text-xs" />
    </div>
  );
}
