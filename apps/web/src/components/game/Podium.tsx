import { T, type TeamScore } from "@arthur/shared";
import { teamColor, teamInk } from "./TeamBadge";

/** Podio di squadra a fine attività (2° – 1° – 3°), con animazione di salita. */
export function Podium({ teams }: { teams: TeamScore[] }) {
  const top = teams.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean) as TeamScore[];
  const height = (rank: number) => (rank === 1 ? "h-[45vh]" : rank === 2 ? "h-[32vh]" : "h-[22vh]");
  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-4 text-center font-display text-[clamp(2.5rem,5vw,5rem)] font-semibold">🏆 {T.game.podium}</h2>
      <ol className="flex flex-1 items-end justify-center gap-[2vw]">
        {order.map((t, i) => (
          <li key={t.id} className="flex w-[22vw] flex-col items-center gap-3" style={{ animationDelay: `${(2 - i) * 250}ms` }}>
            <span className="text-center font-display text-[clamp(1.5rem,2.6vw,3rem)] font-semibold">{t.name}</span>
            <span className="text-[clamp(1.1rem,1.8vw,2rem)] font-bold tabular-nums">{T.game.teamPoints(t.score)}</span>
            <div
              className={`podium-rise flex w-full items-start justify-center rounded-t-3xl pt-4 font-display text-[clamp(3rem,6vw,7rem)] font-semibold ${height(t.rank)}`}
              style={{ background: teamColor(t.index), color: teamInk(t.index), animationDelay: `${(2 - i) * 250}ms` }}
            >
              <span>
                {t.rank}
                <span className="sr-only"> {T.game.position(t.rank)}</span>
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
