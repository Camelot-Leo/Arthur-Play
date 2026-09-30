/** Protocollo WebSocket tra browser e servizio realtime (eventi tipizzati). */
import type { ActivityContent, PublicSlide } from "./slides/schema";

export type SessionStatus = "active" | "ended";

/** Stato della sessione inviato a tutti (partecipanti compresi). Nessun dato personale. */
export type SessionState = {
  status: SessionStatus;
  index: number;
  total: number;
  slide: PublicSlide;
  locked: boolean;
  resultsVisible: boolean;
  /** Epoch ms di fine timer, oppure null se il timer non è attivo. */
  timerEnd: number | null;
  /** Orologio del server (epoch ms) al momento dell'invio, per calcolare il tempo residuo. */
  now: number;
  /** Timer dei quiz: disattivabile o allungabile dal facilitatore (WCAG 2.2.1). */
  quizTimer: { enabled: boolean; factor: number };
  /** Soluzione del quiz, inviata solo a risposte chiuse. */
  reveal: { correctOptionId?: string; acceptedAnswers?: string[] } | null;
};

export type ChoiceResults = { type: "choice"; respondents: number; counts: Record<string, number> };
export type ScaleStat = { count: number; avg: number; dist: number[] };
export type ScaleResults = { type: "scale"; respondents: number; stats: Record<string, ScaleStat> };
export type OpenItem = { id: string; text: string; hidden?: boolean };
export type OpenResults = { type: "open"; respondents: number; total: number; filtered: number; items: OpenItem[] };
export type WordItem = { word: string; count: number; hidden?: boolean };
export type WordcloudResults = { type: "wordcloud"; respondents: number; filtered: number; words: WordItem[] };
export type GridResults = { type: "grid"; respondents: number; points: Record<string, { x: number; y: number; count: number }> };
export type RankingResults = { type: "ranking"; respondents: number; avgRank: Record<string, number> };
export type PointsResults = { type: "points"; respondents: number; avg: Record<string, number> };
export type QaItem = { id: string; text: string; votes: number; answered: boolean; hidden?: boolean };
export type QaResults = { type: "qa"; respondents: number; filtered: number; items: QaItem[] };
/** Quiz: i conteggi per opzione e le corrette arrivano in Proiezione solo a risposte chiuse. */
export type QuizResults = {
  type: "quiz";
  respondents: number;
  revealed: boolean;
  correct: number;
  counts: Record<string, number>;
};
export type SlideResults =
  | ChoiceResults
  | ScaleResults
  | OpenResults
  | WordcloudResults
  | GridResults
  | RankingResults
  | PointsResults
  | QaResults
  | QuizResults;

/** Elenco pubblico del Q&A inviato anche ai partecipanti (senza autori). */
export type QaPublicMessage = { slideId: string; items: Omit<QaItem, "hidden">[] };
export type QaStateReply = Ack<{ items: Omit<QaItem, "hidden">[]; voted: string[]; asked: number }>;
export type QuizResultReply = Ack<{ answered: boolean; correct: boolean; points: number; total: number }>;

export type ResultsMessage = { slideId: string; data: SlideResults };

export type ErrorCode =
  | "invalid"
  | "not_found"
  | "ended"
  | "nickname_taken"
  | "nickname_invalid"
  | "nickname_filtered"
  | "rate_limited"
  | "locked"
  | "not_current"
  | "already_answered"
  | "limit_reached"
  | "unauthorized";

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: ErrorCode };

/** Autenticazione alla connessione Socket.IO. */
export type ParticipantAuth = { role: "participant"; code: string };
export type ControlAuth = { role: "control" | "projection"; ticket: string };

export type JoinReply = Ack<{ token: string; nickname: string; answered: number; expiresAt: number }>;
export type AnswerReply = Ack<{ answered: number }>;
export type ControlInit = Ack<{ activity: ActivityContent; state: SessionState; code: string; expiresAt: number; participants: number }>;

export const EV = {
  // partecipante → server
  join: "p:join",
  resume: "p:resume",
  answer: "p:answer",
  qaAsk: "p:qaAsk",
  qaVote: "p:qaVote",
  qaState: "p:qaState",
  myResult: "p:myResult",
  // regia → server
  init: "c:init",
  goto: "c:goto",
  showResults: "c:results",
  lock: "c:lock",
  timer: "c:timer",
  timerAdd: "c:timerAdd",
  reopen: "c:reopen",
  hide: "c:hide",
  qaMark: "c:qaMark",
  quizTimer: "c:quizTimer",
  close: "c:close",
  // server → client
  state: "state",
  results: "results",
  qa: "qa",
  presence: "presence",
  ended: "ended",
} as const;
