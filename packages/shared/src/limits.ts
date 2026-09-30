/** Limiti e costanti condivise tra web e realtime. */

export const LIMITS = {
  codeLength: 6,
  nicknameMin: 2,
  nicknameMax: 24,
  openAnswerMax: 200,
  openAnswersPerPersonMax: 5,
  wordMax: 25,
  wordsPerPersonMax: 5,
  choiceOptionsMin: 2,
  choiceOptionsMax: 8,
  scaleStatementsMax: 10,
  slidesMax: 100,
  titleMax: 120,
  questionMax: 200,
  bodyMax: 1500,
  notesMax: 1500,
  optionLabelMax: 80,
  imageAltMax: 200,
  imageUploadMaxBytes: 5 * 1024 * 1024,
  imageMaxSide: 1600,
  timerMaxSeconds: 900,
} as const;

/** Durata massima di una sessione live: 24 ore. */
export const LIVE_SESSION_TTL_SECONDS = 24 * 60 * 60;
/** Durata massima di una sessione a ritmo libero: 14 giorni (Fase 4). */
export const ASYNC_SESSION_MAX_SECONDS = 14 * 24 * 60 * 60;

/** Intervallo massimo di invio dei risultati a Proiezione e Regia. */
export const RESULTS_THROTTLE_MS = 200;

/** Percorso del server Socket.IO (stesso dominio in produzione via reverse proxy). */
export const REALTIME_PATH = "/rt";

/** Nome del cookie tecnico con il token del partecipante (per codice sessione). */
export const participantCookieName = (code: string) => `ap_pt_${code}`;
