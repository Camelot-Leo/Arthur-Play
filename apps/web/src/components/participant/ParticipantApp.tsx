"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import {
  EV,
  LIMITS,
  T,
  randomNickname,
  type Answer,
  type AnswerReply,
  type ErrorCode,
  type JoinReply,
  type MissionMessage,
  type QaPublicMessage,
  type SessionState,
} from "@arthur/shared";
import { Footer } from "@/components/Footer";
import { TimerBadge } from "@/components/Timer";
import { ContentSlideView, SlideHeading } from "@/components/slides/SlideParts";
import { clearToken, readToken, saveToken } from "@/lib/client/participant-token";
import { connectRealtime, emitAck } from "@/lib/client/realtime";
import { MissionBar } from "@/components/game/MissionBar";
import { TeamBadge } from "@/components/game/TeamBadge";
import { AnswerInput } from "./Inputs";
import { StandingCard, TeamPicker } from "./Game";
import { QaPanel } from "./QaPanel";
import { QuizFeedback } from "./QuizFeedback";

export type Request = <T>(event: string, payload?: unknown) => Promise<T | null>;

type Phase = "connecting" | "notfound" | "nickname" | "live" | "ended";

const errorText = (e: ErrorCode | string) => (T.errors as Record<string, string>)[e] ?? T.errors.generic;

/** Vista Partecipante (telefono): ingresso con nickname e risposte. */
export function ParticipantApp({ code }: { code: string }) {
  const [phase, setPhase] = useState<Phase>("connecting");
  const [online, setOnline] = useState(true);
  const [state, setState] = useState<SessionState | null>(null);
  const [nickname, setNickname] = useState("");
  const [answered, setAnswered] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const [qa, setQa] = useState<QaPublicMessage | null>(null);
  const [team, setTeam] = useState<string | null>(null);
  // Risposte già inviate alla slide corrente, note all'ingresso/riconnessione (lo stato arriva subito dopo).
  const pendingAnswered = useRef<number | null>(null);

  const onJoined = useCallback(
    (res: Extract<JoinReply, { ok: true }>) => {
      saveToken(code, res.token, res.expiresAt);
      setNickname(res.nickname);
      setTeam(res.team);
      setPhase("live");
      setError("");
    },
    [code],
  );

  useEffect(() => {
    const socket = connectRealtime({ role: "participant", code });
    socketRef.current = socket;

    socket.on("connect", async () => {
      setOnline(true);
      const token = readToken(code);
      if (!token) {
        setPhase((p) => (p === "connecting" ? "nickname" : p));
        return;
      }
      // Riconnessione automatica: il token tecnico riprende la stessa partecipazione.
      const res = await emitAck<JoinReply>(socket, EV.resume, { token }).catch(() => null);
      if (res?.ok) {
        pendingAnswered.current = res.answered;
        onJoined(res);
      } else if (res && !res.ok) {
        clearToken(code);
        setPhase("nickname");
      }
    });
    socket.on("disconnect", () => setOnline(false));
    socket.on("connect_error", (err) => {
      if (err.message === "not_found") {
        socket.disconnect();
        setPhase((p) => (p === "live" ? "ended" : "notfound"));
      } else setOnline(false);
    });
    socket.on(EV.state, (st: SessionState) => {
      setState(st);
      const pending = pendingAnswered.current;
      if (pending !== null) {
        pendingAnswered.current = null;
        setAnswered((a) => ({ ...a, [st.slide.id]: Math.max(pending, a[st.slide.id] ?? 0) }));
      }
    });
    socket.on(EV.qa, (msg: QaPublicMessage) => setQa(msg));
    socket.on(EV.mission, (m: MissionMessage) => setState((st) => (st?.mission ? { ...st, mission: { ...st.mission, ...m } } : st)));
    socket.on(EV.ended, () => {
      clearToken(code);
      setPhase("ended");
      socket.disconnect();
    });
    return () => {
      socket.disconnect();
    };
  }, [code, onJoined]);

  const request: Request = useCallback(async <T,>(event: string, payload?: unknown) => {
    const socket = socketRef.current;
    if (!socket?.connected) return null;
    return emitAck<T>(socket, event, payload).catch(() => null);
  }, []);

  const join = async (nick: string) => {
    const socket = socketRef.current;
    if (!socket) return;
    setSending(true);
    const res = await emitAck<JoinReply>(socket, EV.join, { nickname: nick }).catch(() => null);
    setSending(false);
    if (res?.ok) {
      pendingAnswered.current = res.answered;
      onJoined(res);
    } else setError(errorText(res && !res.ok ? res.error : "generic"));
  };

  const submit = async (answer: Answer): Promise<boolean> => {
    const socket = socketRef.current;
    if (!socket || !state) return false;
    setSending(true);
    const slideId = state.slide.id;
    const res = await emitAck<AnswerReply>(socket, EV.answer, { slideId, answer }).catch(() => null);
    setSending(false);
    if (res?.ok) {
      setAnswered((a) => ({ ...a, [slideId]: res.answered }));
      setError("");
      return true;
    }
    if (res && !res.ok && res.error === "already_answered") setAnswered((a) => ({ ...a, [slideId]: 99 }));
    setError(errorText(res && !res.ok ? res.error : "generic"));
    return false;
  };

  const myTeam = state?.teams?.list.find((t) => t.id === team) ?? null;
  const needsTeam = phase === "live" && state?.teams?.mode === "choice" && !team;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <header className="flex items-center justify-between gap-3 px-4 pt-4">
        <span className="font-display text-lg font-semibold">
          {T.app.name}
        </span>
        {phase === "live" && nickname && (
          <span className="flex min-w-0 items-center gap-2 text-sm">
            <span className="truncate text-muted">{T.participant.you(nickname)}</span>
            {myTeam && <TeamBadge team={myTeam} className="text-xs" />}
          </span>
        )}
      </header>
      {!online && phase !== "notfound" && phase !== "ended" && (
        <p role="status" className="mx-4 mt-3 rounded-xl bg-black px-4 py-2 text-white">
          {T.join.reconnecting}
        </p>
      )}
      <main id="contenuto" className="flex-1 px-4 py-6">
        {phase === "connecting" && <p role="status">{T.join.connecting}</p>}
        {phase === "notfound" && (
          <div className="flex flex-col gap-4">
            <h1 className="text-2xl font-semibold">{T.join.notFound}</h1>
            <Link href="/" className="btn self-start">
              {T.join.tryAgain}
            </Link>
          </div>
        )}
        {phase === "ended" && (
          <h1 role="status" className="text-2xl font-semibold">
            {T.participant.ended}
          </h1>
        )}
        {phase === "nickname" && <NicknameForm onSubmit={join} busy={sending} error={error} />}
        {phase === "live" && state?.mission && !needsTeam && (
          <div className="mb-5">
            <MissionBar mission={state.mission} />
          </div>
        )}
        {needsTeam && state?.teams && <TeamPicker teams={state.teams.list} request={request} onChosen={setTeam} />}
        {phase === "live" && state && !needsTeam && state.view !== "slide" && <StandingCard key={state.view} view={state.view} request={request} />}
        {phase === "live" && state && !needsTeam && state.view === "slide" && (
          <LiveSlide
            state={state}
            answered={answered[state.slide.id] ?? 0}
            onSubmit={submit}
            sending={sending}
            error={error}
            request={request}
            qa={qa?.slideId === state.slide.id ? qa.items : null}
          />
        )}
      </main>
      <Footer />
    </div>
  );
}

function NicknameForm({ onSubmit, busy, error }: { onSubmit: (n: string) => void; busy: boolean; error: string }) {
  const [nick, setNick] = useState("");
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (nick.trim()) onSubmit(nick.trim());
      }}
    >
      <h1 className="text-3xl font-semibold">{T.join.title}</h1>
      <p id="nick-hint" className="text-muted">
        {T.join.hint}
      </p>
      <div>
        <label htmlFor="nickname" className="label">
          {T.join.nicknameLabel}
        </label>
        <input
          id="nickname"
          className="input"
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          minLength={LIMITS.nicknameMin}
          maxLength={LIMITS.nicknameMax}
          autoComplete="off"
          autoCapitalize="words"
          aria-describedby={`nick-hint${error ? " nick-error" : ""}`}
          aria-invalid={!!error}
          required
        />
      </div>
      <button type="button" className="btn" onClick={() => setNick(randomNickname())}>
        🎲 {T.join.random}
      </button>
      {error && (
        <p id="nick-error" role="alert" className="font-bold text-brand-ink">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary text-lg" disabled={busy || nick.trim().length < LIMITS.nicknameMin}>
        {T.join.submit}
      </button>
    </form>
  );
}

function LiveSlide(props: {
  state: SessionState;
  answered: number;
  onSubmit: (a: Answer) => Promise<boolean>;
  sending: boolean;
  error: string;
  request: Request;
  qa: QaPublicMessage["items"] | null;
}) {
  const { state, answered, onSubmit, sending, error } = props;
  const slide = state.slide;
  if (slide.type === "content") {
    return (
      <div key={slide.id} className="animate-slide-in flex flex-col gap-4">
        <p className="text-sm font-bold uppercase tracking-wide text-brand-ink">{T.participant.lookAtScreen}</p>
        <ContentSlideView slide={slide} size="participant" />
      </div>
    );
  }
  if (slide.type === "qa") {
    return (
      <section key={slide.id} className="animate-slide-in flex flex-col gap-5" aria-labelledby="domanda">
        <SlideHeading slide={slide} size="participant" id="domanda" />
        <QaPanel slideId={slide.id} locked={state.locked} request={props.request} liveItems={props.qa} />
      </section>
    );
  }
  const max = slide.type === "open" ? slide.maxAnswers : 1;
  const done = answered >= max;
  const quizLocked = slide.type === "quiz" && state.locked;
  return (
    <section key={slide.id} className="animate-slide-in flex flex-col gap-5" aria-labelledby="domanda">
      <div className="flex items-start justify-between gap-4">
        <SlideHeading slide={slide} size="participant" id="domanda" />
        <TimerBadge timerEnd={state.timerEnd} now={state.now} />
      </div>
      {quizLocked ? (
        <QuizFeedback key={`${slide.id}-fb`} slide={slide} reveal={state.reveal} request={props.request} />
      ) : state.locked ? (
        <p role="status" className="rounded-2xl bg-soft p-4 text-lg font-bold">
          {answered > 0 ? T.participant.sent : T.participant.locked}
        </p>
      ) : done ? (
        <p role="status" className="rounded-2xl bg-black p-4 text-lg font-bold text-white">
          {slide.type === "quiz" ? T.participant.quizWait : T.participant.sent}
        </p>
      ) : (
        <>
          {answered > 0 && (
            <p role="status" className="rounded-2xl bg-soft p-4 font-bold">
              {T.participant.sent} {T.participant.answersLeft(max - answered)}
            </p>
          )}
          <AnswerInput slide={slide} onSubmit={onSubmit} disabled={sending} />
        </>
      )}
      {error && !done && (
        <p role="alert" className="font-bold text-brand-ink">
          {error}
        </p>
      )}
    </section>
  );
}
