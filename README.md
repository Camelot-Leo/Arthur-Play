# Arthur Play

Web app mobile-first di gamification per la formazione su soft skills e competenze trasversali, usata dai facilitatori di Arthur Italia. I partecipanti entrano con un codice a 6 cifre o un QR code, senza account, e rispondono dal telefono.

> **Privacy by design.** Nessun dato personale dei partecipanti viene salvato in modo persistente. I dati delle sessioni vivono solo in Redis, **senza persistenza su disco**, con scadenza automatica, e vengono cancellati alla chiusura della sessione. Dettagli in [Privacy e dati](#privacy-e-dati).

## Stato

| Fase | Contenuto | Stato |
|---|---|---|
| 1 | MVP live: ingresso con codice/QR, tre viste, contenuto, scelta multipla, scala, risposta aperta, word cloud, moderazione, Privacy e cookie | ✅ |
| 2 | Griglia 2x2, Ranking, 100 punti, Q&A anonimo, quiz a punti, PNG del risultato | ✅ |
| 3 | Squadre, missione collettiva, classifica opzionale, suoni e animazioni, podio | ✅ |
| 4 | Modalità a ritmo libero con scadenza, risultati aggregati, quiz con spiegazione | ✅ |
| 5 | Funzioni AI (disattivate di default): generazione di attività da argomento o PDF/DOCX, temi delle risposte aperte e della word cloud | ✅ |
| 6 | Editor con anteprima dal vivo, libreria personale e condivisa con tag, duplica/esporta/importa JSON, pannello admin | ✅ |

## Architettura

```
Browser ──HTTPS──► apps/web (Next.js)      ──► PostgreSQL (facilitatori, attività, immagini, liste di moderazione)
   │                     │
   │                     └──► Redis (crea la sessione: snapshot dell'attività, codice, scadenza)
   └──WebSocket /rt──► apps/realtime (Socket.IO) ──► Redis (tutto lo stato live, con TTL)
```

- `apps/web` — Next.js (App Router), TypeScript, Tailwind. Pagine, autenticazione, editor, API.
- `apps/realtime` — servizio Socket.IO separato: ingresso, risposte, aggregati, controlli della Regia.
- `packages/shared` — testi dell'interfaccia (`src/i18n/it.ts`), schemi delle slide, filtro di moderazione, protocollo WebSocket, chiavi Redis.
- `packages/ai` — funzioni AI (Fase 5): estrazione del testo da PDF/DOCX in memoria, generazione di attività, raggruppamento in temi. Un unico punto costruisce ciò che va all'AI.
- `packages/db` — schema Drizzle, migrazioni, seed delle liste di moderazione, CLI admin.
- `infra/redis/redis.conf` — Redis senza persistenza. `infra/proxy/Caddyfile` — esempio di reverse proxy senza log di accesso.

## Requisiti

- Node.js ≥ 22, pnpm 10
- PostgreSQL 16
- Redis 7

## Avvio locale

```bash
# 1. Dipendenze
pnpm install

# 2. Variabili d'ambiente
cp .env.example .env
# imposta REALTIME_SECRET (almeno 32 caratteri casuali)

# 3. Servizi: PostgreSQL e Redis (installazione nativa)
pnpm services:start          # avvia Postgres e Redis con infra/redis/redis.conf e verifica la persistenza
bash scripts/db-setup.sh     # crea ruolo "arthur" e i database arthur_play e arthur_play_test
#    in alternativa: docker compose up -d  (crea solo arthur_play)

# 4. Database
pnpm db:migrate              # applica le migrazioni
pnpm db:seed                 # carica le liste iniziali del filtro di moderazione

# 5. Primo account (non esiste registrazione pubblica)
pnpm admin:create -- --email tu@esempio.it --name "Nome Cognome"
#    gli altri account si invitano dal pannello /admin
#    per un facilitatore: aggiungi --role facilitator

# 6. Avvio (web su :3000, realtime su :4000)
pnpm dev
```

Accedi da <http://localhost:3000/login>: senza `SMTP_HOST` il magic link viene stampato nella console di `pnpm dev`. I partecipanti entrano da <http://localhost:3000> con il codice mostrato in Regia e Proiezione.

Per un avvio di produzione in locale: `pnpm build && pnpm start`.

### Variabili d'ambiente

| Variabile | Obbligatoria | Descrizione |
|---|---|---|
| `APP_URL` | sì | URL pubblico dell'app (link di accesso, QR code) |
| `NEXT_PUBLIC_REALTIME_URL` | in sviluppo | URL del realtime visto dal browser (es. `http://localhost:4000`). In produzione vuota: stesso dominio via `/rt`. Letta in fase di build |
| `WEB_ORIGIN` | sì | Origine ammessa dal realtime (CORS) |
| `REALTIME_PORT` | no | Porta del realtime (default 4000) |
| `REALTIME_SECRET` | sì | Segreto dei ticket Regia/Proiezione, min 32 caratteri |
| `DATABASE_URL` | sì | Connessione PostgreSQL |
| `REDIS_URL` | sì | Connessione Redis |
| `TRUST_PROXY` | no | `1` solo dietro reverse proxy fidato (usa `X-Forwarded-For` per il rate limiting) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | in produzione | SMTP del provider UE (proposto: Brevo, `smtp-relay.brevo.com:587`) |
| `AI_ENABLED` | no | `1` attiva le funzioni AI. Default disattivate |
| `ANTHROPIC_API_KEY` | con AI attiva | Chiave API Anthropic |
| `AI_MODEL` | no | Modello principale (default `claude-sonnet-5-5`) |
| `AI_FALLBACK_MODELS` | no | Modelli di riserva in ordine, separati da virgola (default `claude-sonnet-5,claude-haiku-4-5`; vuota = nessuna riserva) |
| `MAIL_CONSOLE` | no | `1` stampa le email in console anche con la build di produzione. Solo per i test (`pnpm e2e`), **mai in produzione** |
| `LOG_LEVEL` | no | Livello dei log (default `info`) |

I segreti stanno solo nelle variabili d'ambiente. Il file `.env` è escluso da git. La telemetria di Next.js è disattivata dagli script (`scripts/with-env.mjs`) e dai test; per disattivarla anche lanciando `next` a mano: `npx next telemetry disable`.

### Font

I font Clash Display (titoli) e Satoshi (testo, anche corsivo) sono serviti in self-hosting da `apps/web/public/fonts/` (`ClashDisplay-Variable.woff2`, `Satoshi-Variable.woff2`, `Satoshi-VariableItalic.woff2`) e precaricati. La cartella `public/fonts/` nella root contiene tutti i file originali di Fontshare. I token di design (colori, font, spaziature) sono in `apps/web/src/styles/tokens.css`.

## Test

Prima dei test PostgreSQL e Redis devono essere avviati (`pnpm services:start`) e il database di test migrato:

```bash
DATABASE_URL=postgres://arthur:arthur@127.0.0.1:5432/arthur_play_test pnpm db:migrate
```

| Comando | Cosa verifica |
|---|---|
| `pnpm test` | Vitest: punteggio di squadra, bilanciamento delle squadre e missione collettiva; logica di punteggio del quiz (correttezza e velocità), filtro di moderazione (ogni voce delle liste e le sue varianti), validazione delle risposte, TTL, chiusura e scadenza delle sessioni, Redis senza persistenza, IP hashati e rate limiting, flusso realtime completo, assenza di dati dei partecipanti in log e PostgreSQL. Usa Redis DB 15 e `arthur_play_test` |
| `pnpm e2e` | Playwright: permessi della libreria (un facilitatore non modifica attività altrui né la libreria condivisa, non accede all'admin), anteprima dal vivo dell'editor, esporta/importa JSON, inviti e liste di moderazione dal pannello admin; quiz, ranking, 100 punti, griglia, Q&A, PNG, timer, caricamento dei font; ingresso da smartphone in meno di 15 s, risultati in Proiezione entro 1 s, moderazione, riconnessione, chiusura, **nessuna richiesta verso domini terzi**. Avvia da solo realtime e web (build di produzione); Redis DB 14. Chromium in `PLAYWRIGHT_CHROMIUM_PATH` (default `/opt/pw-browsers/chromium`) |
| (in `pnpm test`) AI | Con API simulata: all'AI non arrivano nickname, token (né hash), codici, id di sessione, risposte filtrate o nascoste; servono almeno 10 risposte; le etichette dei temi passano dal filtro di moderazione; documenti estratti in memoria, file non supportati o troppo grandi rifiutati. In e2e: con AI disattivata nessuna voce nell'interfaccia e API rifiutate |
| `pnpm load` | Test di carico: 300 partecipanti simulati (`-- --participants N`), latenza delle risposte in Proiezione. Redis DB 13 |
| `pnpm load:teams` | Come sopra con 4 squadre: bilanciamento (differenza massima 1) e classifica di squadra |
| `pnpm typecheck`, `pnpm lint` | TypeScript ed ESLint |

## Funzioni della sessione live

- **Tipi di slide**: contenuto, scelta multipla, scala, risposta aperta, word cloud, griglia 2x2, ranking, 100 punti, Q&A anonimo con upvote, quiz a punti (scelta singola o risposta scritta).
- **Regia**: avanzamento, anteprima della slide successiva, note, mostra/nascondi risultati, blocca/riapri, contatore dei connessi, nascondi singole risposte, segna domande del Q&A come risposte, download PNG del risultato (generato nel browser).
- **Timer**: la Regia sceglie la durata in secondi, da 5 a 300 (massimo 5 minuti), con +30 s e stop. I quiz hanno un timer proprio (max 120 s) che parte da solo; il facilitatore può disattivarlo (1000 punti per ogni risposta corretta) o allungarlo ×1,5 / ×2 (WCAG 2.2.1).
- **Quiz**: punteggio 500 + 500 × (tempo residuo / durata), 0 se errata. La soluzione arriva ai telefoni solo a risposte chiuse, insieme all'esito personale.
- **Squadre** (impostazione dell'attività): 2–8 squadre, assegnazione automatica bilanciata o scelta dal partecipante. Punteggio di squadra = media dei punti dei membri; con le squadre la classifica è solo tra squadre. Podio di squadra a fine attività.
- **Missione collettiva**: obiettivo comune (percentuale di risposte corrette ai quiz, aggiornata solo a risposte chiuse, oppure numero di risposte), barra condivisa su Proiezione e telefoni, animazione di completamento.
- **Classifica individuale**: disattivata di default, attivabile per attività (solo senza squadre).
- **Ritmo libero**: dall'elenco attività "Avvia a ritmo libero" con scadenza (da 10 minuti a 14 giorni). I partecipanti entrano con link o codice, **senza nickname**, e avanzano da soli; i quiz mostrano subito esito, soluzione e spiegazione. Il facilitatore vede solo risultati aggregati, aggiornati in tempo reale, che si cancellano alla scadenza o alla chiusura. Il token tecnico impedisce i doppi invii anche a distanza di giorni.
- **Funzioni AI** (solo con `AI_ENABLED=1`):
  - *Genera con l'AI* (elenco attività): argomento oppure PDF/DOCX (max 10 MB), destinatari e numero di slide. Il documento è letto in memoria e scartato; la bozza è validata con gli schemi dell'editor e salvata come attività modificabile.
  - *Raggruppa in temi* (Regia, risposte aperte e word cloud, da 10 risposte visibili): l'AI riceve solo la domanda e i testi visibili e non filtrati; i temi (etichetta, numero, esempi) passano dal filtro di moderazione, restano in Redis con la scadenza della sessione e la Regia li mostra o nasconde in Proiezione.
  - Modelli: principale `claude-sonnet-5-5`, riserve `claude-sonnet-5` e `claude-haiku-4-5`, provate in ordine se il modello precedente declina, restituisce un output non valido, è sovraccarico o non disponibile. La richiesta resta identica.
  - Limite: 20 richieste AI ogni 10 minuti per facilitatore.
- **Editor**: slide in form con **anteprima dal vivo** della slide selezionata, come appare in Proiezione (16:9) e sul telefono del partecipante (stessi componenti delle viste reali). Destinatari (studenti, docenti, entrambi) e tag di percorso.
- **Libreria**: "Le mie attività" (personali) e "Libreria condivisa", con filtri per destinatari e tag. La libreria condivisa è visibile a tutti i facilitatori (avvio, duplica, esporta) ma la modifica e la cura spettano all'admin, che pubblica le proprie attività e ritira quelle condivise.
- **Duplica, esporta, importa**: copia personale di un'attività propria o condivisa; esportazione in JSON (formato `arthur-play/attivita`, versione 1: solo contenuto, destinatari e tag, mai risultati né dati di sessione); importazione come nuova attività personale (file max 1 MB, validato come nell'editor; le immagini restano riferimenti a questa installazione e vengono tolte se non esistono).
- **Pannello admin** (`/admin`, solo admin): elenco degli account e inviti (link di accesso valido 7 giorni; se l'email non parte l'account non viene creato), libreria condivisa, liste del filtro di moderazione in italiano e inglese (aggiunta e rimozione; il realtime le ricarica entro un minuto).
- **Feedback**: suoni sintetizzati nel browser (disattivabili dalla Regia; in Proiezione si attivano con "Attiva i suoni"), animazioni tra le slide, coriandoli e podio; tutto rispetta `prefers-reduced-motion`.

## Privacy e dati

**PostgreSQL** contiene solo: account dei facilitatori (nome, email, ruolo), hash dei magic link e delle sessioni di login (senza IP né user-agent), attività (solo contenuto), immagini delle slide, liste di moderazione. **Nessuna tabella contiene dati dei partecipanti.**

**Redis** contiene lo stato delle sessioni. Tutte le chiavi di una sessione hanno il prefisso `ap:s:{sid}:` e scadono con la sessione (`EXPIREAT`): **24 ore** per le sessioni live. Alla chiusura vengono cancellate tutte.

| Chiave | Contenuto |
|---|---|
| `ap:code:{codice}` | codice → sessione |
| `ap:s:{sid}:meta`, `:activity`, `:locked` | stato della sessione, snapshot dell'attività, slide bloccate |
| `ap:s:{sid}:p`, `:nicks` | hash del token → nickname; nickname in uso |
| `ap:s:{sid}:online` | contatore dei connessi |
| `ap:s:{sid}:r:{slide}:agg`, `:sub`, `:txt`, `:hidden` | aggregati; conteggio invii per hash del token (blocco doppi invii); testi **senza legame con token o nickname**; voci nascoste |
| `ap:s:{sid}:r:{slide}:qa`, `:qav`, `:qav:{id}` | domande del Q&A **senza autore**; voti; hash dei token che hanno votato (un voto per domanda) |
| `ap:s:{sid}:r:{slide}:quiz`, `ap:s:{sid}:score` | esito del quiz e punteggio per hash del token |
| `ap:s:{sid}:teams`, `:tscore`, `:mission` | membri e punti totali per squadra; stato della missione collettiva |
| `ap:s:{sid}:r:{slide}:themes` | temi generati dall'AI (solo etichette, conteggi ed esempi già visibili) |
| `ap:salt` | salt per l'hash degli IP, TTL 24 ore |
| `ap:rl:*` | contatori di rate limiting, TTL 60 s |

**Redis gira senza persistenza su disco** (`infra/redis/redis.conf`: `save ""`, `appendonly no`). Non esiste alcun backup dello stato delle sessioni. Verifica: `redis-cli config get save` → vuoto, `redis-cli config get appendonly` → `no`.

- **Token del partecipante**: 128 bit casuali generati dal server, in un cookie tecnico `ap_pt_{codice}` (SameSite=Strict) che scade con la sessione. In Redis c'è solo il suo hash SHA-256.
- **IP**: usati solo per il rate limiting, come HMAC con salt che ruota ogni 24 ore. Mai scritti nei log.
- **Log**: nessun log di accesso (Next e realtime non ne producono; il reverse proxy d'esempio non logga). I log applicativi non contengono mai IP, nickname, testi delle risposte né payload; gli errori sono registrati solo con tipo e stack.
- **Moderazione**: le risposte filtrate non vengono salvate (se ne conta solo il numero) e non arrivano mai in Proiezione.
- **Nessun dominio terzo**: font, librerie e QR code sono serviti o generati localmente; la CSP (`default-src 'self'`) lo impone.
- **Hosting**: tutti i componenti girano su un qualunque provider con sede e data center in UE. Email via SMTP di un provider UE (proposto: Brevo, Francia).
- **AI (unico flusso esterno, disattivato di default)**: verso l'API Anthropic vanno solo il materiale del facilitatore (argomento o testo del documento) oppure la domanda e i testi visibili delle risposte. Mai nickname, token, codici, id di sessione, risposte filtrate o nascoste. L'API Anthropic non offre una regione di elaborazione UE: attivando l'AI i testi possono essere elaborati fuori dall'UE (eccezione ammessa dal vincolo 8).

## Produzione (note)

Il deploy non fa parte di queste fasi. Schema consigliato: VPS in UE con Next (`pnpm --filter @arthur/web start`), realtime (`pnpm --filter @arthur/realtime start`), PostgreSQL, Redis con `infra/redis/redis.conf`, reverse proxy come `infra/proxy/Caddyfile` con `TRUST_PROXY=1` e `NEXT_PUBLIC_REALTIME_URL` vuota. Per più istanze realtime serve la sticky session sul proxy; l'adapter Redis di Socket.IO è già attivo.
