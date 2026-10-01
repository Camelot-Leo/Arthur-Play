import { T, type MissionState } from "@arthur/shared";

/** Barra di avanzamento condivisa della missione collettiva. */
export function MissionBar({ mission, size = "small" }: { mission: MissionState; size?: "small" | "large" }) {
  const big = size === "large";
  const pct = mission.type === "correct" ? Math.min(100, mission.value) : Math.min(100, (mission.value / mission.target) * 100);
  const targetPct = mission.type === "correct" ? mission.target : 100;
  const valueText = mission.type === "correct" ? T.game.missionValueCorrect(mission.value) : T.game.missionValueAnswers(mission.value, mission.target);
  return (
    <div className={big ? "w-full" : "w-full text-sm"}>
      <div className={`mb-1 flex flex-wrap items-baseline justify-between gap-2 ${big ? "text-[clamp(1rem,1.6vw,1.75rem)]" : ""}`}>
        <span className="font-bold">
          {mission.completed ? `🏆 ${T.game.missionDone}` : mission.label || T.game.mission}
        </span>
        <span>{mission.type === "correct" ? T.game.missionCorrect(mission.target) : T.game.missionAnswers(mission.target)}</span>
      </div>
      <div
        role="progressbar"
        aria-label={T.game.mission}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-valuetext={valueText}
        className={`relative w-full overflow-hidden rounded-full border-2 border-black bg-white ${big ? "h-8" : "h-5"}`}
      >
        <div className={`h-full transition-[width] duration-700 ${mission.completed ? "bg-black" : "bg-brand"}`} style={{ width: `${pct}%` }} />
        {mission.type === "correct" && (
          <div aria-hidden="true" className="absolute inset-y-0 w-1 bg-black" style={{ left: `calc(${targetPct}% - 2px)` }} />
        )}
      </div>
      <p className={`mt-1 ${big ? "text-lg" : ""}`}>{valueText}</p>
    </div>
  );
}
