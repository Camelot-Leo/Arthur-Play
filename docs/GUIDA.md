# Guida pratica — usare, provare e mostrare Arthur Play

Questa guida spiega come vedere e usare Arthur Play in tre situazioni, dalla più semplice alla più completa:

| Scenario | A cosa serve | Cosa serve |
|---|---|---|
| **A. Sul tuo computer** | Esplorare l'app da solo: editor, Regia, Proiezione, telefono simulato nel browser | Un computer (macOS, Linux o Windows con WSL2) |
| **B. In sala, con telefoni veri** | Una prova con colleghi o una classe pilota sulla stessa rete Wi-Fi | Scenario A + telefoni collegati allo stesso Wi-Fi |
| **C. Online, su un server in UE** | Pilota reale: link e QR funzionano ovunque, in HTTPS | Un server (VPS) in UE, un dominio, un account email Brevo |

I dettagli tecnici completi (variabili, chiavi Redis, privacy) sono nel [README](../README.md).

---

## 1. Prerequisiti (scenari A e B)

Installa una sola volta:

1. **Node.js 22** — <https://nodejs.org> (versione LTS 22).
2. **pnpm** — da terminale: `corepack enable` (incluso in Node; se chiede conferma, rispondi sì).
3. **Git** — <https://git-scm.com>.
4. **PostgreSQL 16 e Redis 7**. Il modo più semplice è **Docker Desktop** (<https://www.docker.com/products/docker-desktop/>): il progetto contiene già la configurazione. In alternativa si possono installare nativamente (vedi README).
5. **Windows**: usa **WSL2** con Ubuntu e lavora dentro il terminale Ubuntu (gli script del progetto sono pensati per Linux/macOS).

## 2. Scenario A — l'app sul tuo computer

### 2.1 Scarica il progetto

```bash
git clone https://github.com/camelot-leo/arthur-play.git
cd arthur-play
git checkout claude/bold-feynman-j8stiw   # il branch con tutto il lavoro (finché non viene unito a main)
pnpm install
```

### 2.2 Configura

```bash
cp .env.example .env
```

Apri `.env` con un editor e cambia almeno `REALTIME_SECRET` con una frase casuale di almeno 32 caratteri. Il resto va bene così per l'uso locale.

### 2.3 Avvia database e Redis

Con Docker Desktop aperto:

```bash
docker compose up -d
```

Redis parte **senza alcuna persistenza su disco**, come richiesto dai vincoli. (Senza Docker: `pnpm services:start` e `bash scripts/db-setup.sh`.)

### 2.4 Prepara il database (solo la prima volta)

```bash
pnpm db:migrate        # crea le tabelle
pnpm db:seed           # carica le liste del filtro di moderazione
pnpm admin:create -- --email tuo.nome@camelot-italia.com --name "Nome Cognome"
```

L'ultimo comando crea il primo account **admin**. Gli altri account si invitano poi dal pannello **Amministrazione**.

### 2.5 Avvia l'app

```bash
pnpm dev
```

Lascia aperto questo terminale: è qui che compaiono i messaggi dell'app. Quando vedi `Ready` e `servizio realtime avviato`:

1. Apri <http://localhost:3000/login> e inserisci l'email dell'admin.
2. In locale l'email **non viene spedita**: il link di accesso compare **nel terminale** (`[email di sviluppo] ...`). Copialo nel browser e premi **Accedi**.
3. Sei in **Le mie attività**.

Per fermare tutto: `Ctrl+C` nel terminale, poi `docker compose stop`.

### 2.6 Carica l'attività dimostrativa

Nel progetto c'è un'attività pronta con **tutti i tipi di slide**: [`docs/esempi/attivita-demo.json`](esempi/attivita-demo.json).

In **Le mie attività** premi **Importa JSON** e scegli quel file: si apre l'editor con l'anteprima dal vivo. È anche la prova pratica di esportazione e importazione.

### 2.7 Simulare una sessione con un solo computer

1. In **Le mie attività** premi **Avvia sessione live** sull'attività demo: si apre la **Regia**.
2. Dalla Regia apri la **Proiezione** in una nuova finestra (è la vista per il proiettore, a tutto schermo con `F11`).
3. Apri una **finestra in incognito** (o un altro browser) su <http://localhost:3000>: è il "telefono" del partecipante. Inserisci il codice a 6 cifre e un nickname. Per una vista da smartphone attiva la modalità dispositivo degli strumenti per sviluppatori (`F12` → icona telefono).
4. Per più partecipanti apri altre finestre in incognito o altri browser (ogni finestra in incognito separata conta come un partecipante).

## 3. Scenario B — prova in sala con telefoni veri (stessa rete Wi-Fi)

Il computer del facilitatore fa da server; i telefoni si collegano al suo indirizzo nella rete locale.

1. **Trova l'indirizzo IP del computer** nella rete Wi-Fi:
   - macOS: Impostazioni di Sistema → Wi-Fi → Dettagli → Indirizzo IP (es. `192.168.1.20`);
   - Windows: `ipconfig` → "Indirizzo IPv4";
   - Linux: `hostname -I`.
2. **Modifica `.env`** sostituendo `localhost` con l'IP (esempio con `192.168.1.20`):

   ```bash
   APP_URL=http://192.168.1.20:3000
   WEB_ORIGIN=http://192.168.1.20:3000
   NEXT_PUBLIC_REALTIME_URL=http://192.168.1.20:4000
   DEV_ALLOWED_HOSTS=192.168.1.20
   ```

3. Riavvia `pnpm dev`.
4. Sul computer apri **<http://192.168.1.20:3000>** (non `localhost`) e accedi: il link del terminale ora punta all'IP.
5. Avvia la sessione e mostra la **Proiezione**: QR code e indirizzo puntano già all'IP. I partecipanti inquadrano il QR o aprono l'indirizzo e inseriscono il codice.

Attenzione:

- Se il sistema chiede di consentire le connessioni in entrata per Node.js, **consentile** (porte 3000 e 4000).
- Le reti Wi-Fi "ospiti" o aziendali spesso **isolano i dispositivi** fra loro: in quel caso i telefoni non raggiungono il computer. Usa un hotspot o un router dedicato.
- In questo scenario usa **`pnpm dev`**, non `pnpm build && pnpm start`. In modalità produzione il cookie di accesso del facilitatore richiede HTTPS: senza HTTPS funziona solo su `localhost`.
- Se l'IP del computer cambia, aggiorna `.env` e riavvia.

Questo flusso è stato verificato in modalità sviluppo da un indirizzo di rete: accesso con magic link, importazione della demo, avvio della sessione, ingresso da smartphone in meno di un secondo, risposta visibile in Proiezione, chiusura.

## 4. Percorso di prova consigliato (checklist)

Usa l'attività demo e segna ciò che hai verificato.

**Partecipante (telefono)**
- [ ] Entra con il codice, con il QR e con il link diretto `/g/<codice>`; prova **Genera nickname**.
- [ ] Rispondi a ogni tipo di slide: scelta, word cloud, scala, risposta aperta, griglia, ranking (trascinando o da tastiera), 100 punti, quiz, Q&A con voto.
- [ ] Spegni e riaccendi il Wi-Fi del telefono, oppure ricarica la pagina: rientri nella sessione senza perdere le risposte.
- [ ] Scrivi una parolaccia, anche camuffata (es. `c4zz0`): non compare in Proiezione e in Regia aumenta solo il contatore delle filtrate.

**Regia (facilitatore)**
- [ ] Successiva/precedente, anteprima della slide successiva, note.
- [ ] Mostra/nascondi risultati, blocca e riapri, timer (5–300 s, +30 s), connessi.
- [ ] Nascondi una singola risposta: sparisce dalla Proiezione.
- [ ] Quiz: timer disattivato o ×1,5/×2; soluzione mostrata a risposte chiuse.
- [ ] Classifica e podio (squadre e classifica si attivano nell'editor, sezione Gamification); missione collettiva (attiva nella demo).
- [ ] Scarica PNG del risultato.
- [ ] Chiudi sessione: i telefoni vedono "L'attività è terminata" e i dati vengono cancellati.

**Proiezione**
- [ ] Leggibilità da fondo aula, QR, contatore; "Attiva i suoni".

**Ritmo libero**
- [ ] Avvia a ritmo libero con una scadenza; entra dal telefono (senza nickname), completa al tuo ritmo; nei quiz vedi subito esito e spiegazione; un secondo invio è bloccato.
- [ ] La Regia mostra solo risultati aggregati.

**Editor e libreria**
- [ ] Modifica una slide e guarda l'anteprima dal vivo (Proiezione e telefono); imposta destinatari e tag.
- [ ] Duplica, Esporta JSON, Importa JSON.
- [ ] Da admin: **Pubblica nella libreria condivisa**; da un account facilitatore la vedi in **Libreria condivisa**, puoi avviarla e duplicarla ma non modificarla.

**Amministrazione** (link in alto, solo admin)
- [ ] Invita un facilitatore: in locale il link d'invito compare nel terminale. Aprilo in un altro browser per accedere con quell'account.
- [ ] Aggiungi e rimuovi un termine dalle liste di moderazione: entro un minuto vale nelle sessioni.

## 5. Funzioni AI (facoltative, disattivate di default)

1. Crea una chiave su <https://platform.claude.com> (account Anthropic con fatturazione).
2. Nel file `.env`:

   ```bash
   AI_ENABLED=1
   ANTHROPIC_API_KEY=la-tua-chiave
   ```

3. Riavvia. Compaiono **✨ Genera con l'AI** (in Le mie attività) e **Raggruppa in temi** (in Regia, sulle slide di risposta aperta e word cloud, da 10 risposte visibili).

Modelli: principale Claude Sonnet 5.5, riserve Claude Sonnet 5 e Claude Haiku 4.5. All'AI non arrivano mai nickname, token, codici o risposte filtrate o nascoste. L'elaborazione può avvenire fuori dall'UE: va scritto nella pagina Privacy prima dell'uso reale.

## 6. Test automatici

Con database e Redis avviati, la prima volta:

```bash
docker compose exec postgres createdb -U arthur arthur_play_test    # con Docker
# (installazione nativa: bash scripts/db-setup.sh)
DATABASE_URL=postgres://arthur:arthur@127.0.0.1:5432/arthur_play_test pnpm db:migrate
```

Poi:

| Comando | Cosa verifica | Durata indicativa |
|---|---|---|
| `pnpm test` | Logica, privacy, moderazione, scadenze, permessi, AI simulata | ~40 s |
| `pnpm e2e` | L'app vera nel browser: tutte le fasi, nessun dominio terzo, permessi | ~2 min (compila l'app) |
| `pnpm load` | 300 partecipanti simulati, risposte in Proiezione entro 1 s | ~30 s |
| `pnpm load:teams` | Come sopra con 4 squadre | ~30 s |
| `pnpm typecheck`, `pnpm lint` | Controlli del codice | ~30 s |

Per `pnpm e2e` serve Chromium di Playwright: `pnpm exec playwright install chromium` (una volta sola). I test usano database e Redis separati e non toccano i tuoi dati.

## 7. Scenario C — pilota online su un server in UE

Il deploy non faceva parte delle fasi di sviluppo: questa è la procedura consigliata per un pilota. Serve qualcuno con un minimo di dimestichezza con Linux.

### 7.1 Cosa procurarsi

- Un **VPS in UE** con Ubuntu 24.04, 2 vCPU e 4 GB di RAM (per esempio Hetzner in Germania o Finlandia, OVHcloud o Scaleway in Francia). Ne basta uno per più sessioni da 300 partecipanti.
- Un **dominio** o sottodominio, es. `play.arthuritalia.it`, con un record DNS `A` verso l'IP del server.
- Un account **Brevo** (Francia) per le email, con il dominio mittente verificato e le credenziali SMTP.

### 7.2 Installazione sul server

```bash
# Pacchetti di sistema
sudo apt update && sudo apt install -y git postgresql redis-server caddy curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt install -y nodejs
sudo corepack enable

# Redis SENZA persistenza (vincolo 3): sostituisce la configurazione del pacchetto
sudo tee /etc/redis/redis.conf >/dev/null <<'EOF'
bind 127.0.0.1
port 6379
protected-mode yes
save ""
appendonly no
dbfilename ""
EOF
sudo systemctl restart redis-server
redis-cli config get save          # deve risultare vuoto
redis-cli config get appendonly    # deve risultare "no"

# Database
sudo -u postgres psql -c "CREATE ROLE arthur LOGIN PASSWORD 'scegli-una-password-robusta'"
sudo -u postgres psql -c "CREATE DATABASE arthur_play OWNER arthur"

# Codice
sudo useradd -m -s /bin/bash arthur
sudo -iu arthur
git clone https://github.com/camelot-leo/arthur-play.git && cd arthur-play
git checkout claude/bold-feynman-j8stiw
pnpm install
cp .env.example .env
```

### 7.3 `.env` di produzione

```bash
APP_URL=https://play.arthuritalia.it
NEXT_PUBLIC_REALTIME_URL=
WEB_ORIGIN=https://play.arthuritalia.it
REALTIME_SECRET=<64 caratteri casuali: openssl rand -hex 32>
DATABASE_URL=postgres://arthur:scegli-una-password-robusta@127.0.0.1:5432/arthur_play
REDIS_URL=redis://127.0.0.1:6379/0
TRUST_PROXY=1
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=<utente SMTP Brevo>
SMTP_PASS=<chiave SMTP Brevo>
MAIL_FROM=Arthur Play <no-reply@arthuritalia.it>
LOG_LEVEL=info
AI_ENABLED=0
```

Non impostare mai `MAIL_CONSOLE` né `DEV_ALLOWED_HOSTS` in produzione.

```bash
pnpm db:migrate && pnpm db:seed
pnpm admin:create -- --email tuo.nome@camelot-italia.com --name "Nome Cognome"
pnpm build
exit   # torna all'utente amministratore del server
```

### 7.4 Servizi sempre attivi (systemd)

```bash
sudo tee /etc/systemd/system/arthur-web.service >/dev/null <<'EOF'
[Unit]
Description=Arthur Play web
After=network.target postgresql.service redis-server.service
[Service]
User=arthur
WorkingDirectory=/home/arthur/arthur-play
ExecStart=/usr/bin/pnpm --filter @arthur/web start
Restart=always
[Install]
WantedBy=multi-user.target
EOF
sudo tee /etc/systemd/system/arthur-realtime.service >/dev/null <<'EOF'
[Unit]
Description=Arthur Play realtime
After=network.target postgresql.service redis-server.service
[Service]
User=arthur
WorkingDirectory=/home/arthur/arthur-play
ExecStart=/usr/bin/pnpm --filter @arthur/realtime start
Restart=always
[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now arthur-web arthur-realtime
```

Gli errori restano consultabili con `journalctl -u arthur-web` e non contengono dati dei partecipanti.

### 7.5 HTTPS e stesso dominio (Caddy)

Copia `infra/proxy/Caddyfile` in `/etc/caddy/Caddyfile`, sostituisci `arthurplay.example.it` con il tuo dominio, poi `sudo systemctl reload caddy`. Caddy ottiene da solo il certificato HTTPS e non registra log di accesso.

Apri <https://play.arthuritalia.it/login>: il link arriva ora davvero via email.

### 7.6 Manutenzione

- **Aggiornare**: `sudo -iu arthur`, `cd arthur-play && git pull && pnpm install && pnpm db:migrate && pnpm build`, poi `sudo systemctl restart arthur-web arthur-realtime`. Aggiorna fuori dagli orari delle sessioni: il riavvio interrompe quelle live.
- **Backup**: solo PostgreSQL (`pg_dump arthur_play`), cioè account, attività, immagini e liste. **Mai backup di Redis**: per scelta le sessioni non devono sopravvivere.
- **Firewall**: lascia aperte solo le porte 22, 80 e 443 (`sudo ufw allow OpenSSH; sudo ufw allow 80; sudo ufw allow 443; sudo ufw enable`). PostgreSQL e Redis restano su `127.0.0.1`.

## 8. Prima dell'uso con classi reali

- [ ] **Testo della pagina Privacy e cookie** (ora segnaposto), incluse le funzioni AI se attive.
- [ ] **Credenziali Brevo** e prova di invio reale di login e inviti.
- [ ] Verifica con il responsabile privacy (DPO): partecipanti minorenni, valutazione d'impatto, nomina del fornitore del server ed eventualmente di Anthropic come responsabili del trattamento.
- [ ] Unire il branch `claude/bold-feynman-j8stiw` in `main` dopo la revisione.
- [ ] Una prova pilota (scenario B o C) con un piccolo gruppo prima di una classe intera.

## 9. Problemi frequenti

| Sintomo | Causa probabile e soluzione |
|---|---|
| `ECONNREFUSED 127.0.0.1:6379` o `:5432` | Redis o PostgreSQL non avviati: `docker compose up -d` (o `pnpm services:start`) |
| Non arriva l'email di accesso in locale | È normale: il link è nel terminale di `pnpm dev` |
| Il link di accesso dice "non valido" | Vale 15 minuti ed è monouso: richiedine un altro |
| I telefoni non aprono la pagina (scenario B) | Firewall del computer, Wi-Fi che isola i dispositivi o IP cambiato; vedi sezione 3 |
| La pagina si apre sul telefono ma non risponde ai tocchi (scenario B) | Manca `DEV_ALLOWED_HOSTS` con l'IP in `.env`; riavvia `pnpm dev` |
| Dopo l'accesso dall'IP torni sempre al login | Stai usando `pnpm start` senza HTTPS: in rete locale usa `pnpm dev` |
| "Genera con l'AI" non compare | `AI_ENABLED=1` e `ANTHROPIC_API_KEY` mancanti, oppure app non riavviata |
| Il codice della sessione non funziona più | La sessione è stata chiusa o è scaduta (24 h live, scadenza scelta a ritmo libero) |
