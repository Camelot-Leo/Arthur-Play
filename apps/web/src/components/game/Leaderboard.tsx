import { T, type BoardMessage } from "@arthur/shared";
import { teamColor, teamInk } from "./TeamBadge";

/** Classifica per la Proiezione (e in piccolo per la Regia): solo squadre se attive, altrimenti individuale. */
export function Leaderboard({ board, size = "large" }: { board: BoardMessage; size?: "large" | "small" }) {
  const big = size === "large";
  if (board.teams) {
    return (
      <div>
        {big && <h2 className="mb-6 font-display text-[clamp(2rem,4vw,4rem)] font-semibold">{T.game.teamsLeaderboard}</h2>}
        <ol className={`flex flex-col ${big ? "gap-4" : "gap-2"}`}>
          {board.teams.map((t) => (
            <li key={t.id} className="animate-slide-in flex items-center gap-4">
              <span className={`w-14 shrink-0 font-display font-semibold ${big ? "text-5xl" : "text-xl"}`}>{t.rank}°</span>
              <span
                className={`flex flex-1 items-center justify-between rounded-2xl font-bold ${big ? "px-6 py-4 text-[clamp(1.25rem,2.2vw,2.5rem)]" : "px-3 py-2"}`}
                style={{ background: teamColor(t.index), color: teamInk(t.index) }}
              >
                <span>
                  {t.name} <span className="font-normal opacity-90">· {T.game.members(t.members)}</span>
                </span>
                <span className="tabular-nums">{T.game.teamPoints(t.score)}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className={`mt-4 text-muted ${big ? "text-lg" : "text-xs"}`}>{T.game.teamScoreHint}</p>
      </div>
    );
  }
  if (board.top) {
    return (
      <div>
        {big && <h2 className="mb-6 font-display text-[clamp(2rem,4vw,4rem)] font-semibold">{T.game.leaderboard}</h2>}
        {board.top.length === 0 ? (
          <p className="text-muted">{T.game.noPoints}</p>
        ) : (
          <ol className={`grid gap-3 ${big ? "grid-cols-2 text-[clamp(1.1rem,1.8vw,2rem)]" : "text-sm"}`}>
            {board.top.map((e, i) => (
              <li key={i} className={`animate-slide-in flex items-center justify-between rounded-2xl border-2 border-black ${big ? "px-5 py-3" : "px-3 py-1"} ${e.rank === 1 ? "bg-black text-white" : ""}`}>
                <span className="font-bold">
                  {e.rank}° {e.nickname}
                </span>
                <span className="tabular-nums">{e.score}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  }
  return null;
}
