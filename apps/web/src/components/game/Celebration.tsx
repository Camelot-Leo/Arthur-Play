"use client";
import { T } from "@arthur/shared";

/** Festeggiamento del completamento della missione: coriandoli CSS (disattivati con prefers-reduced-motion). */
export function Celebration() {
  const pieces = Array.from({ length: 48 }, (_, i) => i);
  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center overflow-hidden" role="status">
      {pieces.map((i) => (
        <span
          key={i}
          aria-hidden="true"
          className="confetti"
          style={{
            left: `${(i * 97) % 100}%`,
            background: i % 3 === 0 ? "var(--color-brand)" : i % 3 === 1 ? "var(--color-black)" : "var(--color-team-2)",
            animationDelay: `${(i % 12) * 80}ms`,
          }}
        />
      ))}
      <p className="celebrate-pop rounded-3xl bg-black px-[4vw] py-[3vh] font-display text-[clamp(2.5rem,6vw,6rem)] font-semibold text-white">
        🏆 {T.game.missionDone}
      </p>
    </div>
  );
}
