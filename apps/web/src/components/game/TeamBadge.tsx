import type { TeamInfo } from "@arthur/shared";

/** Colore della squadra dai token (tokens.css). Testo nero sul rosso, bianco sugli altri (contrasto AA). */
export const teamColor = (index: number) => `var(--color-team-${(index % 8) + 1})`;
export const teamInk = (index: number) => (index % 8 === 0 ? "#000000" : "#ffffff");

export function TeamBadge({ team, className = "" }: { team: TeamInfo; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 font-bold ${className}`}
      style={{ background: teamColor(team.index), color: teamInk(team.index) }}
    >
      {team.name}
    </span>
  );
}
