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
- **Log**: nessun log di accesso; `pino` con redazione; errori registrati solo con tipo e stack.
- **Design**: token in `apps/web/src/styles/tokens.css`. Bianco, nero, rosso `#FF3A20`; Clash Display (titoli) e Satoshi (testo) self-hosted da `public/fonts/` con fallback di sistema. **Font non ancora presenti**: si usa il fallback.

## Dipendenze approvate

Runtime: `next`, `react`, `react-dom`, `tailwindcss`, `@tailwindcss/postcss`, `zod`, `socket.io`, `socket.io-client`, `@socket.io/redis-adapter`, `ioredis`, `drizzle-orm`, `postgres`, `jose`, `nodemailer`, `qrcode`, `sharp`, `pino`, `@dnd-kit/core`, `@dnd-kit/sortable` (Fase 2), `@anthropic-ai/sdk`, `unpdf`, `mammoth` (Fase 5).

Sviluppo: `typescript`, `@types/node`, `@types/react`, `@types/nodemailer`, `@types/qrcode`, `drizzle-kit`, `tsx`, `vitest`, `@playwright/test`, `eslint`, `eslint-config-next`.

Senza dipendenze: grafici SVG, export PNG (SVG → canvas), suoni Web Audio, animazioni CSS, generatore nickname, test di carico con `socket.io-client`.

## Stato delle fasi

- [x] Fase 0 — Piano approvato
- [x] Fase 1 — MVP live (vedi note sotto)
- [ ] Fase 2 — Tipi di slide restanti e quiz
- [ ] Fase 3 — Gamification
- [ ] Fase 4 — Ritmo libero
- [ ] Fase 5 — Funzioni AI
- [ ] Fase 6 — Editor completo, libreria condivisa, admin

## Note operative (Fase 1)

- Comandi: `pnpm test` (vitest, Redis DB 15, DB `arthur_play_test`), `pnpm e2e` (Playwright, Redis DB 14, avvia i servizi da solo), `pnpm load` (300 partecipanti, Redis DB 13), `pnpm typecheck`, `pnpm lint`.
- Gli script di web e realtime caricano `.env` della root tramite `scripts/with-env.mjs`, che disattiva anche la telemetria di Next.
- `drizzle-orm` è riesportato da `@arthur/db` (`and`, `eq`, `sql`, ...): non importarlo direttamente nelle app.
- Migrazioni applicate: `0000_iniziale` (approvata).
- Ogni scrittura su una chiave di sessione in Redis deve essere accompagnata da `PEXPIREAT` alla scadenza della sessione, così nessuna chiave può sopravvivere senza TTL.
- Il testo delle risposte filtrate non viene salvato: si incrementa solo il contatore `filtered`.
- Nessun pacchetto aggiunto oltre l'elenco approvato (`server-only` evitato di proposito). `@arthur/db`, `@arthur/shared` e `socket.io-client` sono devDependency della root per test e2e e di carico.
