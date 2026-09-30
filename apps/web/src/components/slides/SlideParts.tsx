import { T, type PublicSlide } from "@arthur/shared";

type Size = "projection" | "participant" | "compact";

const titleSize: Record<Size, string> = {
  projection: "text-[clamp(2rem,4.2vw,4.5rem)]",
  participant: "text-2xl sm:text-3xl",
  compact: "text-xl",
};
const bodySize: Record<Size, string> = {
  projection: "text-[clamp(1.25rem,2vw,2.25rem)]",
  participant: "text-lg",
  compact: "text-base",
};

/** Titolo o domanda della slide. */
export function SlideHeading({ slide, size, id }: { slide: PublicSlide; size: Size; id?: string }) {
  const text = slide.type === "content" ? slide.title : slide.question;
  return (
    <h2 id={id} className={`font-display font-semibold ${titleSize[size]}`}>
      {text}
    </h2>
  );
}

/** Slide di contenuto: titolo, testo, immagine (con testo alternativo). */
export function ContentSlideView({ slide, size }: { slide: Extract<PublicSlide, { type: "content" }>; size: Size }) {
  return (
    <div className={`flex h-full flex-col gap-6 ${size === "projection" ? "justify-center" : ""}`}>
      <SlideHeading slide={slide} size={size} />
      <div className={`flex gap-8 ${size === "projection" ? "min-h-0 flex-1 items-center" : "flex-col"}`}>
        {slide.body && <p className={`${bodySize[size]} max-w-prose whitespace-pre-line`}>{slide.body}</p>}
        {slide.image && (
          // eslint-disable-next-line @next/next/no-img-element -- immagine servita dalla nostra API, senza ottimizzazione esterna
          <img
            src={`/api/immagini/${slide.image.id}`}
            alt={slide.image.alt}
            className={`rounded-2xl object-contain ${size === "projection" ? "max-h-[55vh] min-w-0 flex-1" : "max-h-72 w-full"}`}
          />
        )}
      </div>
    </div>
  );
}

export function slideTypeLabel(slide: PublicSlide) {
  return T.slideTypes[slide.type];
}
