# CLAUDE.md — Arthur Play

Web app mobile-first di gamification per la formazione (soft skills), usata dai facilitatori di Arthur Italia.
Interfaccia interamente in italiano. Questo file va aggiornato alla fine di ogni fase.

## Vincoli non negoziabili

1. **Nessun dato personale dei partecipanti.** Ingresso senza account, nickname libero, nulla di identificativo salvato in modo persistente. Molti partecipanti sono minorenni.
2. **Risultati volatili.** I dati di sessione vivono solo in Redis con TTL e vengono cancellati alla chiusura. Live: max 24 h. Ritmo libero: scadenza scelta dal facilitatore, max 14 giorni. Nessuno storico, nessun report per persona, nessun export di dati dei partecipanti.
3. **Redis senza persistenza su disco**: `save ""`, `appendonly no`, nessun backup dello stato delle sessioni.
4. **Token tecnico di partecipante**: casuale, per sessione, in cookie tecnico o sessionStorage; non deriva da dati di dispositivo o rete; cancellato con la sessione. In Redis solo il suo hash SHA-256.
5. **IP e log**: IP usati solo per rate limiting, come HMAC con salt che ruota ogni 24 h, contatori Redis con TTL breve. Nessun IP in chiaro nei log; log di accesso disattivati o con IP troncato. **Mai loggare** nickname, testo delle risposte o payload delle richieste, nemmeno negli errori.
6. **Nessun tracciamento**: niente analytics, pixel, cookie non tecnici. **Nessuna richiesta del browser verso domini terzi**: font, icone, suoni, librerie, QR serviti dal dominio dell'app o generati localmente.
7. **Fuori scope**: badge, Open Badge, percorsi formativi, progressi individuali, integrazioni con Arthur/Camelot/Parsifal.
8. **Hosting e dati in UE.** Unico flusso esterno: funzioni AI (Fase 5), disattivate di default.
9. **Interfaccia in italiano**, testi centralizzati in `packages/shared/src/i18n/it.ts`.

## Regole di lavoro

- Realizzare solo ciò che è descritto: nessuna funzione, pagina o dipendenza non richiesta.
- **Fermarsi e chiedere prima di**: aggiungere dipendenze fuori elenco; salvare in modo persistente dati generati da partecipanti; creare o modificare migrazioni del DB; eliminare file; qualsiasi scelta che contraddica i vincoli.
- Dopo ogni passaggio: `✅ [cosa] — [file]`. A fine fase: tutti i test, aggiornare CLAUDE.md e README, commit e push su `claude/bold-feynman-j8stiw`, riepilogo, stop per revisione.
- Ambiente di sviluppo: all'inizio della sessione avviare PostgreSQL (`pg_ctlcluster 16 main start`) e Redis (`redis-server infra/redis/redis.conf --daemonize yes`) prima dei test.

## Decisioni approvate (Fase 0)

- **Stack**: pnpm workspace. `apps/web` Next.js App Router + TypeScript + Tailwind; `apps/realtime` servizio Socket.IO separato; `packages/shared` (i18n, schemi slide, moderazione, punteggi, protocollo WS, nickname); `packages/db` (Drizzle, migrazioni, seed).
- **Flusso sessione**: Next fotografa l'attività in Redis all'avvio (codice 6 cifre, scadenza). Il realtime lavora solo su Redis; PostgreSQL non vede mai dati di sessione. Facilitatore autenticato sul WS con ticket JWT HMAC di 5 minuti (`REALTIME_SECRET`).
- **Carico**: aggregati incrementali in Redis; risultati a Proiezione/Regia con throttle ≤ 250 ms; i partecipanti non ricevono i risultati altrui. Scalabilità orizzontale con adapter Redis di Socket.IO.
- **Stesso dominio** in produzione via reverse proxy (`/` → Next, `/rt` → realtime), senza log di accesso. CSP stretta `default-src 'self'`.
- **PostgreSQL** (solo): `users` (nome, email, ruolo), `login_tokens` (hash), `auth_sessions` (hash, senza IP/UA), `activities` (contenuto jsonb, impostazioni, libreria, destinatari, tag), `images` (bytea WebP), `moderation_terms` (lang, term, match `word`|`contains`).
- **Redis**: tutte le chiavi di sessione con prefisso `ap:s:{sid}:` ed `EXPIREAT` = scadenza sessione; chiusura = `SCAN` + `DEL` + chiave `ap:code:{codice}`. Testi delle risposte salvati senza legame con token o nickname. Rate limit `ap:rl:*` TTL 60 s; salt `ap:salt` TTL 24 h.
- **Token partecipante**: 128 bit dal server, cookie tecnico `ap_pt_{codice}` (SameSite=Strict, Max-Age = scadenza sessione).
- **Rate limit**: per IP larghi (classi dietro un unico IP), per token stretti.
- **Login facilitatori**: magic link (token 256 bit, hash, 15 min, monouso; invito 7 giorni), cookie `ap_sess` HttpOnly 30 giorni. Nessuna registrazione pubblica; primo admin da CLI. Email via SMTP **Brevo** (Francia); in locale il link è stampato in console.
- **Immagini**: in PostgreSQL, ridimensionate a max 1600 px, WebP, EXIF rimossi, servite da `/api/immagini/{id}`; alt obbligatorio.
- **Moderazione**: normalizzazione (minuscole, accenti, 4→a 3→e 0→o 1→i @→a $→s, rimozione spazi e punteggiatura interni); modalità per termine `contains` (default ≥ 5 caratteri) o `word`. Risposte filtrate mai in Proiezione né all'AI; in Regia solo il conteggio.
- **Quiz**: corretta = 500 + 500 × (tempo residuo / totale); errata = 0; timer disattivato → 1000. Timer disattivabile, moltiplicabile (×1,5, ×2), estendibile (WCAG 2.2.1).
- **Timer della Regia** (deciso dopo la Fase 1): durata libera scelta dal facilitatore, da 5 a **300 secondi** (max 5 minuti); anche le estensioni (+30 s) non portano mai il tempo residuo oltre i 5 minuti. Timer dei quiz nell'editor: max 120 s (×2 = 240 s).
- **Log**: nessun log di accesso; `pino` con redazione; errori registrati solo con tipo e stack.
- **Design**: token in `apps/web/src/styles/tokens.css`. Bianco, nero, rosso `#FF3A20`; Clash Display (titoli) e Satoshi (testo) self-hosted da `public/fonts/` con fallback di sistema. Font presenti: file woff2 variabili in `apps/web/public/fonts/` (copiati da `public/fonts/` della root, caricati su `main`), precaricati nel layout. I font di sistema restano solo come ripiego tecnico in CSS.

## Dipendenze approvate

Runtime: `next`, `react`, `react-dom`, `tailwindcss`, `@tailwindcss/postcss`, `zod`, `socket.io`, `socket.io-client`, `@socket.io/redis-adapter`, `ioredis`, `drizzle-orm`, `postgres`, `jose`, `nodemailer`, `qrcode`, `sharp`, `pino`, `@dnd-kit/core`, `@dnd-kit/sortable` (Fase 2), `@anthropic-ai/sdk`, `unpdf`, `mammoth` (Fase 5).

Sviluppo: `typescript`, `@types/node`, `@types/react`, `@types/nodemailer`, `@types/qrcode`, `drizzle-kit`, `tsx`, `vitest`, `@playwright/test`, `eslint`, `eslint-config-next`.

Senza dipendenze: grafici SVG, export PNG (SVG → canvas), suoni Web Audio, animazioni CSS, generatore nickname, test di carico con `socket.io-client`.

## Stato delle fasi

- [x] Fase 0 — Piano approvato
- [x] Fase 1 — MVP live (vedi note sotto)
- [x] Fase 2 — Tipi di slide restanti e quiz
- [x] Fase 3 — Gamification
- [x] Fase 4 — Ritmo libero
- [x] Fase 5 — Funzioni AI
- [x] Fase 6 — Editor completo, libreria condivisa, admin

## Note operative (Fase 1)

- Comandi: `pnpm test` (vitest, Redis DB 15, DB `arthur_play_test`), `pnpm e2e` (Playwright, Redis DB 14, avvia i servizi da solo), `pnpm load` (300 partecipanti, Redis DB 13), `pnpm typecheck`, `pnpm lint`.
- Gli script di web e realtime caricano `.env` della root tramite `scripts/with-env.mjs`, che disattiva anche la telemetria di Next.
- `drizzle-orm` è riesportato da `@arthur/db` (`and`, `eq`, `sql`, ...): non importarlo direttamente nelle app.
- Migrazioni applicate: `0000_iniziale` (approvata).
- Ogni scrittura su una chiave di sessione in Redis deve essere accompagnata da `PEXPIREAT` alla scadenza della sessione, così nessuna chiave può sopravvivere senza TTL.
- Il testo delle risposte filtrate non viene salvato: si incrementa solo il contatore `filtered`.
- Nessun pacchetto aggiunto oltre l'elenco approvato (`server-only` evitato di proposito). `@arthur/db`, `@arthur/shared` e `socket.io-client` sono devDependency della root per test e2e e di carico.

## Note operative (Fase 2)

- Nuovi tipi: `grid`, `ranking`, `points`, `qa`, `quiz` (schemi in `packages/shared/src/slides/schema.ts`, validazione in `answers.ts`, punteggio in `scoring/quiz.ts`).
- Quiz: la soluzione non è mai nella slide pubblica (`toPublicSlide`); arriva ai partecipanti in `SessionState.reveal` solo a risposte chiuse. Esito personale con `p:myResult`, solo a risposte chiuse. Punteggi nello zset `ap:s:{sid}:score` (hash del token, con TTL). Classifica: Fase 3.
- Timer dei quiz: parte da solo entrando nella slide, se attivo; `c:quizTimer` lo disattiva o moltiplica. Disattivandolo durante una domanda il timer in corso si ferma e le risposte successive valgono 1000.
- Q&A: domande senza autore (`:qa`), voti in `:qav` e set dei votanti `:qav:{id}` (hash dei token), max 3 domande a testa. I partecipanti ricevono l'elenco pubblico (evento `qa`) per votare: è l'unica eccezione alla regola "i partecipanti non ricevono i risultati altrui".
- Export PNG: `resultSvg` (puro, in `packages/shared/src/export/`) → canvas nel browser (`apps/web/src/lib/client/download-png.ts`). Esclude sempre le voci nascoste.
- Dipendenze aggiunte (già approvate): `@dnd-kit/core`, `@dnd-kit/sortable`. `@dnd-kit/utilities` arriva come dipendenza transitiva, non è importato direttamente.
- Telemetria Next: disattivata dagli script (`with-env.mjs`), dalla config Playwright e sulla macchina di sviluppo (`next telemetry disable`); test di regressione in `packages/shared/test/no-telemetry.test.ts`.

## Note operative (Fase 3)

- Impostazioni attività (`settings`): `teams` {enabled, mode `auto`|`choice`, names 2–8}, `mission` {enabled, type `correct`|`answers`, target, label}, `leaderboard` (default false, ignorata con squadre attive). Attività salvate prima: `normalizeSettings` applica i default.
- Squadre: id `t1..tN`. Assegnazione automatica bilanciata e atomica (Lua in `apps/realtime/src/gamification.ts`); scelta del partecipante una sola volta (`p:team`). La squadra è salvata nel JSON del partecipante (`{n, t}`) e in `socket.data.team`.
- Punteggio di squadra = **media** dei punti dei membri (`rankTeams`, `packages/shared/src/scoring/teams.ts`); pari punteggio = pari posizione. Classifica solo tra squadre quando le squadre sono attive.
- Missione "correct": conta solo i quiz già svelati (niente anticipazioni a quiz aperto); "answers": ogni risposta accettata (anche domande Q&A non filtrate). Il completamento è definitivo (`done`). Evento `mission` a tutte le stanze a ogni flush.
- Classifica (`board`): alla Regia sempre, alla Proiezione solo con vista `leaderboard`/`podium` (`c:view`); i telefoni chiedono la propria posizione con `p:standing`. Cambiare slide riporta la vista a `slide`.
- Suoni: Web Audio sintetizzati in `apps/web/src/lib/client/sounds.ts`; attivabili dalla Regia (`c:sounds`, default attivi) e sbloccati in Proiezione dal pulsante "Attiva i suoni" (richiesto dai browser).
- Colori delle squadre in `tokens.css` dentro `:root` (non in `@theme`, altrimenti Tailwind li elimina perché non usati come classi). Test e2e verifica i colori effettivi.
- Nuove chiavi Redis: `:teams`, `:tscore`, `:mission` (tutte con TTL della sessione).
- `pnpm load:teams`: test di carico con 4 squadre (bilanciamento + classifica).

## Note operative (Fase 4)

- Sessione `mode: "async"` (`createSession(..., { mode: "async", ttlSeconds })`): scadenza scelta dal facilitatore, da 10 minuti a 14 giorni (validata nell'API e limitata in `createSession`). Live resta max 24 h.
- Ingresso a ritmo libero **senza nickname** (`p:info` dice la modalità prima dell'ingresso). Niente squadre, classifica né missione a ritmo libero.
- Il partecipante riceve tutte le slide pubbliche all'ingresso (`JoinReply.slides`) e `answeredSlides` (dal contatore `:sub` per hash del token): è l'unica informazione per riprendere e bloccare i doppi invii. La posizione corrente è solo nel browser.
- Le risposte vanno a qualunque slide (`targetInteractive`); nessun blocco/timer. Quiz: riscontro immediato nell'ack (`feedback`: corretta, soluzione, `explanation`). `explanation` non è mai nella slide pubblica.
- Facilitatore: `/regia/[sid]` mostra `AsyncDashboard` (solo aggregati di tutte le slide, `allResults` all'init + aggiornamenti per slide; conteggio di chi ha iniziato = `HLEN` dei partecipanti). I comandi di conduzione live sono rifiutati (`withMeta` senza `asyncAllowed`).
- Alla scadenza (TTL) il sweep avvisa la dashboard; il codice smette di funzionare.

## Note operative (Fase 5)

- Pacchetto `packages/ai`: `config.ts` (`AI_ENABLED=1` attiva, default spento; `AI_MODEL` default `claude-sonnet-5-5`, `AI_FALLBACK_MODELS` default `claude-sonnet-5,claude-haiku-4-5`; decisione dell'utente dopo la Fase 5), `transport.ts` (unico punto che chiama l'SDK: `messages.parse` con output strutturato zod; rifiuto → `AiRefusedError`; `withFallbacks` prova le riserve in ordine per rifiuto, output non valido, 404/408/429/5xx o errori di rete, non per 400/401/403; `effort` non inviato a Haiku 4.5), `documents.ts` (unpdf/mammoth in memoria, max 10 MB e 120.000 caratteri, nessun troncamento silenzioso), `generate.ts`, `themes.ts`.
- Payload verso l'AI: `AiRequest` = {model, system, user, effort, maxTokens}. Generazione: solo argomento o testo del documento. Temi: `collectThemeInputs` legge solo `:txt` non nascosti (aperte) o voci non nascoste (word cloud); le filtrate non sono mai salvate. Minimo 10 risposte (`MIN_THEME_RESPONSES`).
- Etichette ed esempi dei temi passano dal filtro di moderazione; temi in `ap:s:{sid}:r:{slide}:themes` (`SET PXAT` alla scadenza). La Regia li mostra con `c:themes` ({slideId, visible}); `goto` li nasconde; arrivano in `results.themes` solo a Proiezione/Regia.
- API: `POST /api/ai/genera` (multipart; crea una nuova attività bozza) e `POST /api/sessioni/[sid]/temi`. Rate limit `aiPerUser` 20/10 min. Pagina `/attivita/genera` → 404 con AI spenta.
- I test usano un trasporto simulato (`packages/ai/test/ai.test.ts`); nessuna chiamata reale. L'API Anthropic non ha `inference_geo` UE (solo `us`/`global`).
- Dipendenze aggiunte (già approvate): `@anthropic-ai/sdk`, `unpdf`, `mammoth`.

## Note operative (Fase 6)

- Nessuna migrazione: lo schema `0000_iniziale` aveva già `library`, `audience`, `tags` e i token `invite`.
- Permessi in `packages/shared/src/library.ts` (puri, testati): `canView` (proprie + condivise), `canEdit` (personali solo del proprietario; condivise solo admin, anche se il proprietario era un facilitatore), `canSetLibrary` (solo admin: pubblica le proprie personali, ritira le condivise). Lato server `apps/web/src/lib/server/activities.ts`: la query di modifica ripete il controllo nel `WHERE` (`editableBy`). Risposte: attività non visibile → 404; visibile ma non modificabile → 403; pagine admin → 404 per i non admin, API admin → 403.
- Le sessioni si possono avviare anche da attività condivise (snapshot in Redis come sempre).
- `PUT /api/attivita/[id]` riceve `{content, meta}` (`activityDocumentSchema`: id delle slide unici, tag normalizzati). Nuove API: `POST .../duplica`, `GET .../esporta`, `POST .../libreria` (admin), `POST /api/attivita/importa`, `POST /api/admin/inviti`, `POST /api/admin/moderazione`, `DELETE /api/admin/moderazione/[id]`.
- Esportazione `{formato: "arthur-play/attivita", versione: 1, attivita: {title, description?, slides, settings, audience, tags}}`; importazione con `parseImport` (campi estranei scartati dagli schemi zod).
- Anteprima dal vivo: `components/editor/SlidePreview.tsx` riusa `ContentSlideView`, `SlideHeading` e `AnswerInput`; contenuto `inert`, nessun invio. La Proiezione è disegnata a 1280×720 e ridimensionata.
- Inviti: `inviteUser` in transazione (account + token + email); `MAIL_CONSOLE=1` solo per e2e (build di produzione senza SMTP).
- Non realizzato perché non richiesto: eliminazione di attività, disattivazione degli account dal pannello (la colonna `disabled_at` esiste), proposta di attività alla libreria da parte dei facilitatori.

## Note operative (dopo la Fase 6: messa in uso)

- Guida d'uso in `docs/GUIDA.md` (locale, rete locale, VPS UE, checklist di prova); attività dimostrativa importabile `docs/esempi/attivita-demo.json` (tutti i tipi di slide, validata con `parseImport`).
- `next.config.ts`: `agentRules: false` (Next 16 in dev scriveva `apps/web/AGENTS.md` e `apps/web/CLAUDE.md`); `allowedDevOrigins` da `DEV_ALLOWED_HOSTS` (solo dev, prova da smartphone in LAN).
- In rete locale usare `pnpm dev`: con la build di produzione il cookie `ap_sess` è `Secure` e senza HTTPS funziona solo su `localhost`.
- Nell'ambiente cloud Chromium usa il proxy per gli host diversi da localhost: per provare un IP locale lanciarlo con `--no-proxy-server`.
- `playwright.config.ts` usa `/opt/pw-browsers/chromium` solo se esiste, altrimenti il Chromium di `playwright install`.

## Punti aperti da ricordare

- **Invio email reale** (magic link via SMTP Brevo): non ancora provato, mancano le credenziali. Da trattare in seguito su richiesta dell'utente.
- **Testo della pagina Privacy e cookie**: in attesa del testo fornito dall'utente (ora segnaposto). Deve citare anche le funzioni AI (elaborazione possibile fuori UE).
- `public/fonts/` nella root (caricata su `main`) è la sorgente dei font; l'app usa le copie in `apps/web/public/fonts/`. Non eliminare nulla senza chiedere.
