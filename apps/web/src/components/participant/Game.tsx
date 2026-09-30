"use client";
import { useEffect, useState } from "react";
import { EV, T, type ScreenView, type StandingReply, type TeamInfo, type TeamReply } from "@arthur/shared";
import { teamColor, teamInk } from "@/components/game/TeamBadge";
import type { Request } from "./ParticipantApp";

/** Scelta della squadra (modalità "scelta dal partecipante"): una sola volta. */
export function TeamPicker({ teams, request, onChosen }: { teams: TeamInfo[]; request: Request; onChosen: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <section aria-labelledby="squadra" className="flex flex-col gap-4">
      <h1 id="squadra" className="text-3xl font-semibold">
        {T.game.chooseTeam}
      </h1>
      <p className="text-muted">{T.game.chooseTeamHint}</p>
      <div className="grid grid-cols-1 gap-3">
        {teams.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={busy}
            className="min-h-16 rounded-2xl px-4 text-xl font-bold"
            style={{ background: teamColor(t.index), color: teamInk(t.index) }}
            onClick={async () => {
              setBusy(true);
              const r = await request<TeamReply>(EV.chooseTeam, { teamId: t.id });
              setBusy(false);
              if (r?.ok) onChosen(r.team);
            }}
          >
            {t.name}
          </button>
        ))}
      </div>
    </section>
  );
}

/** Mentre la Proiezione mostra classifica o podio, il telefono mostra la propria posizione. */
export function StandingCard({ view, request }: { view: ScreenView; request: Request }) {
  const [st, setSt] = useState<Extract<StandingReply, { ok: true }> | null>(null);
  useEffect(() => {
    let alive = true;
    void request<StandingReply>(EV.standing).then((r) => {
      if (alive && r?.ok) setSt(r);
    });
    return () => {
      alive = false;
    };
  }, [request, view]);
  return (
    <section role="status" className="animate-slide-in flex flex-col gap-4">
      <p className="text-sm font-bold uppercase tracking-wide text-brand-ink">{T.game.lookAtScreen}</p>
      <h1 className="text-3xl font-semibold">{view === "podium" ? T.game.podium : T.game.leaderboard}</h1>
      {st?.team && st.teamRank && (
        <p className="rounded-2xl p-5 text-center font-display text-2xl font-semibold" style={{ background: teamColor(st.team.index), color: teamInk(st.team.index) }}>
          {T.game.yourTeamPosition(st.team.name, st.teamRank)}
          <span className="mt-1 block text-lg font-normal">{T.game.teamPoints(st.teamScore ?? 0)}</span>
        </p>
      )}
      {st?.rank && <p className="rounded-2xl bg-black p-5 text-center font-display text-2xl font-semibold text-white">{T.game.yourPosition(st.rank)}</p>}
      {st && <p className="text-center font-bold">{T.game.yourScore(st.score)}</p>}
    </section>
  );
}
