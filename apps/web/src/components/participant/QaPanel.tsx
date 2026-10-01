"use client";
import { useEffect, useId, useState } from "react";
import { EV, LIMITS, T, type Ack, type QaPublicMessage, type QaStateReply } from "@arthur/shared";
import type { Request } from "./ParticipantApp";

type Items = QaPublicMessage["items"];
const errorText = (e: string) => (T.errors as Record<string, string>)[e] ?? T.errors.generic;

/** Q&A anonimo: domande (max 3 a testa) e un voto per domanda. Nessun autore è mostrato né salvato. */
export function QaPanel({ slideId, locked, request, liveItems }: { slideId: string; locked: boolean; request: Request; liveItems: Items | null }) {
  const [initial, setInitial] = useState<Items>([]);
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [asked, setAsked] = useState(0);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const id = useId();
  const items = liveItems ?? initial;

  useEffect(() => {
    let alive = true;
    void request<QaStateReply>(EV.qaState, { slideId }).then((r) => {
      if (!alive || !r?.ok) return;
      setInitial(r.items);
      setVoted(new Set(r.voted));
      setAsked(r.asked);
    });
    return () => {
      alive = false;
    };
  }, [request, slideId]);

  const left = LIMITS.qaQuestionsPerPersonMax - asked;

  const ask = async () => {
    setBusy(true);
    const r = await request<Ack<{ asked: number }>>(EV.qaAsk, { slideId, text: text.trim() });
    setBusy(false);
    if (r?.ok) {
      setAsked(r.asked);
      setText("");
      setMsg(T.participant.qaSent);
    } else setMsg(errorText(r && !r.ok ? r.error : "generic"));
  };

  const vote = async (qid: string) => {
    setVoted((v) => new Set(v).add(qid));
    const r = await request<Ack<{ votes: number }>>(EV.qaVote, { slideId, qid });
    if (r && !r.ok && r.error !== "already_answered") {
      setVoted((v) => {
        const n = new Set(v);
        n.delete(qid);
        return n;
      });
      setMsg(errorText(r.error));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {!locked && left > 0 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) void ask();
          }}
        >
          <label htmlFor={id} className="label">
            {T.participant.qaAsk}
          </label>
          <textarea id={id} className="input min-h-24" maxLength={LIMITS.qaQuestionMax} value={text} onChange={(e) => setText(e.target.value)} disabled={busy} />
          <p className="mt-1 text-sm text-muted">{T.participant.qaAsksLeft(left)}</p>
          <button type="submit" className="btn btn-primary mt-3 w-full" disabled={busy || !text.trim()}>
            {T.participant.qaSend}
          </button>
        </form>
      )}
      {!locked && left <= 0 && <p className="rounded-2xl bg-soft p-4 font-bold">{T.participant.qaLimit}</p>}
      {locked && <p className="rounded-2xl bg-soft p-4 font-bold">{T.participant.locked}</p>}
      <p aria-live="polite" className="font-bold">
        {msg}
      </p>

      <section aria-labelledby={`${id}-list`}>
        <h2 id={`${id}-list`} className="mb-3 text-xl font-semibold">
          {T.participant.qaList}
        </h2>
        {items.length === 0 ? (
          <p className="text-muted">{T.participant.qaEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((q) => {
              const mine = voted.has(q.id);
              return (
                <li key={q.id} className={`flex items-start gap-3 rounded-2xl border-2 p-3 ${q.answered ? "border-line text-muted" : "border-black"}`}>
                  <button
                    type="button"
                    className={`flex min-h-12 min-w-14 shrink-0 flex-col items-center justify-center rounded-xl border-2 border-black font-bold ${mine ? "bg-black text-white" : ""}`}
                    aria-label={mine ? T.participant.qaVoted(q.text) : T.participant.qaVote(q.text)}
                    aria-pressed={mine}
                    disabled={mine || locked || q.answered}
                    onClick={() => void vote(q.id)}
                  >
                    <span aria-hidden="true">▲</span>
                    <span className="tabular-nums">{q.votes}</span>
                  </button>
                  <div className="min-w-0">
                    <p className="break-words">{q.text}</p>
                    {q.answered && <p className="text-sm font-bold">{T.participant.qaAnswered}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
