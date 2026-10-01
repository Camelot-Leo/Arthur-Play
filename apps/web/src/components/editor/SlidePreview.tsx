"use client";
import { useEffect, useRef, useState } from "react";
import { T, toPublicSlide, type PublicSlide, type Slide } from "@arthur/shared";
import { AnswerInput } from "@/components/participant/Inputs";
import { ContentSlideView, SlideHeading } from "@/components/slides/SlideParts";

/** Larghezza virtuale della Proiezione: l'anteprima la ridimensiona mantenendo il 16:9. */
const STAGE_W = 1280;
const STAGE_H = 720;

/**
 * Anteprima dal vivo dell'editor: la slide selezionata come appare in Proiezione e sul
 * telefono del partecipante, con gli stessi componenti delle viste reali. Solo visiva:
 * i campi sono inerti e nulla viene inviato.
 */
export function SlidePreview({ slide, index }: { slide: Slide; index: number }) {
  const pub = toPublicSlide(slide);
  // Rimonta i campi a ogni modifica, così l'anteprima non conserva stati superati (es. ordine del ranking).
  const key = JSON.stringify(pub);
  return (
    <section aria-label={T.editor.previewOf(index + 1)} className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{T.editor.preview}</h2>
      <div>
        <p className="label">{T.editor.previewProjection}</p>
        <ProjectionFrame key={`p-${key}`} slide={pub} />
      </div>
      <div>
        <p className="label">{T.editor.previewParticipant}</p>
        <PhoneFrame key={`t-${key}`} slide={pub} />
      </div>
    </section>
  );
}

function ProjectionFrame({ slide }: { slide: PublicSlide }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setScale((entry?.contentRect.width ?? STAGE_W) / STAGE_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="relative w-full overflow-hidden rounded-xl border-2 border-black bg-white" style={{ aspectRatio: "16 / 9" }}>
      <div
        inert
        className="absolute left-0 top-0 flex flex-col gap-8 p-14"
        style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
        {slide.type === "content" ? (
          <ContentSlideView slide={slide} size="projection" />
        ) : (
          <>
            <SlideHeading slide={slide} size="projection" />
            <p className="flex flex-1 items-center justify-center rounded-3xl border-4 border-dashed border-line text-5xl text-muted">{T.editor.previewResults}</p>
          </>
        )}
      </div>
    </div>
  );
}

function PhoneFrame({ slide }: { slide: PublicSlide }) {
  return (
    <div className="mx-auto h-[560px] w-[320px] max-w-full overflow-hidden rounded-[2rem] border-[6px] border-black bg-white">
      <div inert className="h-full overflow-y-auto p-4">
        {slide.type === "content" ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm font-bold uppercase tracking-wide text-brand-ink">{T.participant.lookAtScreen}</p>
            <ContentSlideView slide={slide} size="participant" />
          </div>
        ) : slide.type === "qa" ? (
          <div className="flex flex-col gap-4">
            <SlideHeading slide={slide} size="participant" />
            <p className="label">{T.participant.qaAsk}</p>
            <div className="input min-h-20" />
            <span className="btn btn-primary self-start">{T.participant.qaSend}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <SlideHeading slide={slide} size="participant" />
            <AnswerInput slide={slide} onSubmit={async () => false} disabled={false} />
          </div>
        )}
      </div>
    </div>
  );
}
