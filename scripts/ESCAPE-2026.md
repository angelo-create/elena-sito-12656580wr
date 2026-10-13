# Escape 2026 — firma elettronica

Pagina: `/lib-escape-2026-pgv` (anche `.html`); API: `POST /api/liberatoria-escape`.
Il corso Coach conserva la propria pagina, API e testo. Nessun cambio alle altre pagine societarie: il nuovo civico 35 è applicato a Escape.

## Testo e consensi

`js/escape-text.js` è l'unica fonte per testo browser, informativa integrale, consensi e PDF. Incrementare `TEXT_VERSION` quando cambia il testo. L'API rifiuta versioni obsolete con 409, prima di registrare la firma.

Organizzatore/titolare: X77 SSD a.r.l., P.IVA 17336811009, Via Leonardo Umile 35, 00144 Roma. Evento 30 settembre–4 ottobre 2026, Poggiovalle; maggiorenni; Metodo Easy, respirazione, meditazione, camminate e corsa.

L'accettazione obbligatoria accorpa partecipazione, presa visione privacy e immagini come richiesto dal committente. Newsletter facoltativa; nessuna casella preselezionata. Questo accorpamento presenta la criticità del consenso libero/specifico e **non costituisce conformità GDPR verificata**. Prima dell'uso definitivo validare il testo, la base del consenso immagini, le garanzie dei fornitori/trasferimenti e l'attuazione della conservazione: documento fino a 10 anni, immagini/newsletter fino a revoca e massimo 24 mesi senza rinnovo. Questi termini sono scelte del testo e richiedono gestione operativa nel CRM, non sono cancellazioni automatiche implementate dal sito.

## Archivio

Cartella GHL: `Liberatorie Escape 2026`. Tag additivo: `liberatoria-firmata-escape-2026`. Campi `escape_2026_*`: fotografia della firma più recente, separata dai campi del corso Coach. Non modificare `consenso_marketing` generale: newsletter false nel modulo Escape non è una revoca di iscrizioni precedenti.

Ogni firma produce un PDF nominato con UUID e hash, e una nuova nota del contatto con prefisso `ESCAPE_SIGNATURE_V1`, URL/ID del file, hash, timestamp UTC, versione, consensi, IP/browser e fingerprint della richiesta. Il PDF include dati, testo e firma; la nota viene aggiunta e mai sovrascritta dall'applicazione. Note e file restano tecnicamente modificabili/cancellabili dagli amministratori GHL: questo non è un archivio immutabile o una conservazione qualificata.

L'upsert segue le impostazioni di deduplicazione del subaccount GHL; verificare la priorità email/telefono. Le API non ricevono tag o campi storici durante l'upsert. L'API restituisce successo solo dopo PDF, nota, campi Escape e tag. Se fallisce l'aggiornamento dei campi/tag dopo la nota, il retry con lo stesso ID ripara l'indicizzazione senza creare un altro PDF. Se fallisce la creazione della nota dopo l'upload, può restare un PDF orfano nella cartella: riconciliare tramite UUID nel nome e log prima di rimuoverlo.

I retry completati sono riconosciuti dalla nota per contatto e UUID. Richieste simultanee identiche nello stesso processo sono condivise; tra istanze serverless non esiste un lock distribuito: possono crearsi due registrazioni dello stesso UUID. Nessuna garanzia exactly-once. Non rispedire automaticamente email su replay, per evitare doppie comunicazioni.

I file Media GHL hanno URL accessibili a chi possiede il link, come l'integrazione preesistente; non condividere i link pubblicamente. `noindex` sulla pagina non equivale a un controllo di accesso al PDF. In caso di requisiti di download autenticato serve un archivio privato dedicato.

## Configurazione e verifica

Variabili server necessarie: `GHL_PIT_TOKEN`, `GHL_LOCATION_ID`.
Variabile opzionale per l'email: `GHL_ESCAPE_EMAIL_WEBHOOK_URL`, da configurare separatamente per ambiente Vercel. Non utilizzare il webhook Coach/NCV senza verificare le sue azioni.

```sh
node --env-file=.env.vercel.local scripts/setup-ghl-escape.js
node --env-file=.env.vercel.local scripts/setup-ghl-escape.js --apply
node --test tests/escape.test.cjs
```

Il comando senza `--apply` legge soltanto configurazione e workflow. `--apply` crea solo i campi mancanti e la cartella vuota; non invia email, non iscrive contatti, non cambia workflow.

Verifica eseguita il 29 settembre 2026 sul subaccount delle credenziali locali:
- Creati e riletti gli 11 campi Escape e la cartella dedicata; `STORAGE_READY`.
- Lettura workflow: HTTP 401. Occorre accesso `workflows.readonly` per elencarli; l'elenco comunque non verifica azioni e template.
- Webhook Escape assente nella configurazione locale. Invio e consegna reali non verificati.
- Nessun contatto reale modificato per i test e nessuna email inviata.
- Test API/PDF con servizio GHL simulato; prova browser Chromium mobile 390×844 con firma touch, newsletter false, errore upload/retry e controllo della pagina Coach.

## Workflow email da collegare prima della pubblicazione

Creare un workflow dedicato `Escape 2026 — copia liberatoria`, con trigger Inbound Webhook. Usare il payload della richiesta corrente, **non il campo latest del contatto**, per evitare che una firma successiva cambi l'allegato di un invio in coda.

Payload: `contact_id`, `email`, `first_name`, `last_name`, `pdf_url`, `pdf_filename`, `signed_at`, `event_tag`, `event_name`, `submission_id`.

- Nessun gate sul consenso newsletter: è una comunicazione di servizio.
- Nessuna iscrizione marketing automatica da questo webhook.
- Deduplicare l'invio per `submission_id` se si prevede il reinvio manuale.
- Mittente: indirizzo X-Fit Academy verificato nel subaccount; reply-to `info.xfitacademy@gmail.com`.
- Oggetto: `La tua liberatoria firmata — Escape 2026`.
- Corpo: `Ciao [first_name], la tua liberatoria per Escape, dal 30 settembre al 4 ottobre 2026 a Poggiovalle, è stata registrata. Puoi scaricarla qui: [pdf_url]. Conserva questa email per i tuoi archivi. Per assistenza: info.xfitacademy@gmail.com. Ci vediamo a Escape! Elena — X-Fit Academy / X77 SSD a.r.l.`

Collegare l'URL nella variabile dedicata, verificare con un destinatario di test autorizzato che il link apra il PDF corretto e controllare la consegna. L'API espone `emailStatus=requested` per webhook 2xx: significa solo richiesta accettata, non email consegnata. Negli altri casi la pagina mostra il link al PDF senza promettere l'invio.

Prima di pubblicare: verificare variabili nel deployment effettivo, workflow e consegna, policy di conservazione e testo definitivo. Pubblicato il 29 settembre 2026 su https://www.elenagiordani.com/lib-escape-2026-pgv (deployment dpl_EtrjFXcnQvpcgjGdP1zg5EELZtz3). Verificati cartella e 11 campi con credenziali di produzione, pagina e testo pubblico, header noindex e validazione API senza creare contatti. Webhook email ancora assente: il PDF è scaricabile dalla conferma. Il rilascio conserva la versione già online di evento-novembre.html. Deployment precedente per eventuale rollback: dpl_7y1FghPdFssymZhDGjzKX93bsrTE.
