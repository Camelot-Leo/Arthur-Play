"use client";
import { useEffect, useState } from "react";
import { T } from "@arthur/shared";

/** Secondi residui del timer, compensando la differenza tra orologio del server e del client. */
export function useCountdown(timerEnd: number | null, serverNow: number): number | null {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!timerEnd) return;
    const offset = serverNow - Date.now();
    const tick = () => setLeft(Math.max(0, Math.ceil((timerEnd - (Date.now() + offset)) / 1000)));
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 250);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [timerEnd, serverNow]);
  return timerEnd ? left : null;
}

export function TimerBadge({ timerEnd, now, large = false }: { timerEnd: number | null; now: number; large?: boolean }) {
  const left = useCountdown(timerEnd, now);
  if (left === null) return null;
  return (
    <div
      role="timer"
      aria-live="off"
      aria-label={T.participant.timeLeft(left)}
      className={`inline-flex items-center justify-center rounded-full bg-black font-bold tabular-nums text-white ${
        large ? "h-24 min-w-24 px-6 text-5xl" : "h-12 min-w-12 px-4 text-xl"
      } ${left <= 5 ? "bg-brand text-black" : ""}`}
    >
      {left}
    </div>
  );
}
