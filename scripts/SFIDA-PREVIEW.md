# Il Primo Passo, offerta pubblica 37 €

Landing aggiornata su richiesta dell’utente: copia del markup renderizzato e degli stili della pagina attuale `https://lp.elenagiordani.com/s7g`, senza riscrittura dei testi o redesign.

Anteprima dedicata: `/sfida-7-giorni` → `/sfida-checkout` → `/sfida-esito`.

## Avvio e verifica

```sh
node scripts/preview-sfida.cjs
node --test tests/sfida-preview.test.cjs
```

Aprire `http://localhost:4173/sfida-funnel` per la mappa di tutte le pagine, oppure `http://localhost:4173/sfida-7-giorni` per il percorso principale. Il server locale serve soltanto i file di questa anteprima; non carica `.env.vercel.local`. Il secret di firma locale viene creato all'avvio: riavviare il server invalida le sessioni di prova precedenti.

Il carrello `/sfida-checkout` è ora la variante ottimizzata a schermata unica: inserire email e nome fittizi, confermare la prova e completare il pagamento simulato. Il rifiuto e la misura locale si trovano negli strumenti in fondo alla pagina. La copia a due passaggi rimane su `/sfida-checkout-originale`. La misura locale è facoltativa. Il pulsante di anteprima nel riepilogo apre i dettagli dell'ordine verificato. Un accesso diretto senza ricevuta non genera Purchase. La verifica del nuovo carrello è `.context/sfida-checkout-cro/verify.py` (porta 4174, avvio con `SFIDA_PREVIEW_PORT=4174 node scripts/preview-sfida.cjs`); lo script delle copie precedenti è `.context/sfida-funnel/verify-browser.py` e usa il vecchio percorso a due passaggi.

Sono state aggiunte le copie del riepilogo, della Home alternativa, del carrello alternativo con popup e della variante denominata 27Euro. Il relativo report con fonti è `.context/sfida-funnel/report.md`. Il nome 27Euro non determina il prezzo della prova: il riepilogo originale mostra 37 €, importo usato dalla simulazione. Lo step con i campi di pagamento ospitati da Stripe non è stato verificato live e resta una simulazione esplicita, non una replica pixel per pixel di quei campi.

Le schermate, il test browser e gli esiti di verifica sono in `.context/sfida-preview/`. Il bundle di deploy è generato nella stessa cartella e comprende soltanto i nuovi file e le tre immagini impiegate, evitando di pubblicare modifiche concorrenti del workspace. `.context/` è gitignored. Il deploy è un ambiente Preview del progetto Vercel esistente, non un deploy di produzione.

## Confini dell'implementazione

Questa è una **anteprima funzionante, non un funnel di produzione**. Non addebita denaro, non invia email o eventi a Meta, non aggiunge contatti a GHL e non attiva accessi nell'app. Il controllo di anteprima sul riepilogo lo dichiara esplicitamente; il contenuto grafico mantiene il testo originale. Non vengono modificate campagne o collegamenti nelle ads.

Il simulatore usa ticket firmati sul server, con prezzo di 3700 centesimi e offerta `sfida-primo-passo-37-preview`. Non usa il catalogo OTO esistente a 27 €. La richiesta del browser non può modificare l'importo. I ticket non contengono nome o email; sono conservati nell'archivio di sessione e inviati via POST, mai nella query URL.

Gli eventi di prova restano nel browser. La conferma genera un esempio del contratto Purchase browser/server, con lo stesso event ID legato all'ordine, ma **non invia una richiesta CAPI**. Non è implementato un database ordini, un webhook di fulfillment né una coda persistente di retry. La deduplicazione della simulazione nel browser non va descritta come deduplicazione server di produzione.

## Configurazione Vercel Preview

- `SFIDA_PREVIEW_SECRET`: valore casuale di almeno 32 caratteri; necessario e riservato.
- `SFIDA_PREVIEW_MODE`: `simulation` (predefinito) oppure `stripe-test`.
- `SFIDA_STRIPE_TEST_SECRET_KEY`: esclusivamente `sk_test_...`, necessaria solo per `stripe-test`.
- `SFIDA_PREVIEW_BASE_URL`: origine HTTPS esatta dell'anteprima, senza slash finale, necessaria per i ritorni da Stripe test.

`VERCEL_ENV=production` blocca sempre l'endpoint. La modalità Stripe rifiuta chiavi live e non legge `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, token Meta o credenziali GHL già esistenti. Gli errori non stampano chiavi, email o contenuto delle richieste.

Il connettore Stripe test crea una Checkout Session con prezzo server, ID richiesta usato per idempotenza e metadata first/last touch. La conferma legge **la sessione inclusa nel ticket firmato**, non un ID scelto dalla query del browser, e controlla livemode, stato paid/complete, importo, valuta, prodotto e riferimento ordine. La query non è prova di pagamento. Il suo funzionamento è coperto da test con doppio Stripe: nessuna chiamata reale a Stripe test è stata effettuata in assenza della chiave dedicata. Timestamp di esempio dell'evento Stripe: data creazione sessione; il futuro webhook dovrà usare il timestamp del pagamento effettivo.

Documentazione consultata:
- https://docs.stripe.com/testing
- https://docs.stripe.com/webhooks
- https://vercel.com/docs/functions/runtimes/node-js

## Provenienza e 10 giorni

Il consenso dell'anteprima abilita una prima osservazione firmata e datata dal server, conservata localmente per 90 giorni, e una provenienza last touch separata. Gli otto parametri ammessi sono `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `campaign_id`, `adset_id`, `ad_id`; valori limitati, nessuna copia integrale della query o di URL contenenti dati personali. Una nuova campagna sostituisce l'intero gruppo last touch, senza assemblare parametri di campagne differenti. Il pagamento conserva l'istantanea nel ticket e, in modalità Stripe test, nei metadata della Session.

La prima osservazione non si aggiorna quando la persona torna. Il server calcola `eligibleAfter = firstSeen + 10 giorni`. **Non prova la prima conoscenza assoluta di Elena**, non segue una persona tra dispositivi e non popola alcun pubblico Meta. Revoca del consenso, scadenza o cancellazione dell'archivio fanno perdere l'osservazione. Non vengono bloccati gli acquisti spontanei nei primi dieci giorni: il vincolo richiesto riguarda le ads, non l'accesso al checkout.

## Copia esatta della landing attuale

La prima proposta grafica è stata sostituita su indicazione dell'utente. Sono stati conservati il markup renderizzato originale, tutti gli stili, i testi, l'ordine delle sezioni, le immagini, i font e i due player video. Le immagini, i font e il video continuano a essere serviti dagli stessi URL della pagina originale; una futura migrazione autonoma di questi asset richiederà un nuovo confronto.

Rimossi soltanto runtime del builder e script di tracciamento di produzione. I controlli video originali sono ripristinati in `js/sfida-originale.js`; le nove CTA della sfida puntano al checkout simulato. I due collegamenti Stripe di altre offerte, presenti in blocchi nascosti nella pagina originale, non portano a pagamenti reali nell'anteprima. Nessuna barra o banner nuovo è stato aggiunto alla landing, per conservarne l'aspetto. Il checkout mostra chiaramente la modalità di prova.

Provenienza prima del consenso: i parametri di campagna ammessi vengono passati nella URL del checkout senza salvarli. Il consenso facoltativo è richiesto lì; la prima osservazione firmata inizia quando viene espresso, non retroattivamente all'ingresso senza consenso. Il runtime di misurazione non invia dati a Meta.

Screenshot e documentazione di confronto in `.context/sfida-originale/`:
- `desktop-completa.png`, `mobile-completa.png`: acquisizione originale.
- `riferimento-*-completa.png`, `copia-*-completa.png`: confronto controllato, animazioni ferme.
- `comparison.json`: stessa dimensione, stesso testo visibile e differenza pixel media **0/255** per desktop 1440 × 1000 e mobile 390 × 844. Le immagini confrontate comprendono l'intera altezza della landing.

Il confronto è una verifica visiva a queste dimensioni, non una certificazione dei claim presenti nel testo né un test della consegna reale del prodotto.

## Prima di abilitare vendite reali

La preview è pronta per la revisione. Il passaggio live richiede un'implementazione distinta:

1. Verificare checkout in Stripe test con le chiavi dedicate e tutti gli esiti, incluso pagamento asincrono se abilitato.
2. Verificare condizioni applicabili all'offerta digitale e messaggi/email di accesso; confermare la destinazione reale nell'app. I link in anteprima rimandano alle condizioni e privacy già pubblicate.
3. Collegare un archivio persistente ordini/rimborsi e un webhook con firma verificata, ID evento/ordine univoci, idempotenza e retry persistenti per gli effetti esterni. Non usare memoria o filesystem effimero Vercel come registro.
4. Implementare consegna effettiva del prodotto da 37 € senza riutilizzare per errore i tag dell'OTO da 27 €; verificare l'accesso con account di prova.
5. Integrare la CMP reale, Pixel/CAPI, identificatori consentiti, evento Purchase al pagamento e deduplicazione nel dataset corretto. Verificare gli eventi in ambiente di test Meta, non con il solo esempio JSON.
6. Collegare contatti identificati e consenso a un sistema duraturo per gestire l'eleggibilità pubblicitaria dopo 10 giorni e l'esclusione di chi ha acquistato. Il solo localStorage non basta.
7. Dopo questi controlli e la revisione, pubblicare il percorso reale e impostare un test della landing mantenendo stabili le altre variabili. Nessun aumento automatico di budget.

## Carrello ottimizzato e obiettivo CR

Su richiesta successiva il carrello è stato ridisegnato; la landing resta la copia originale. Obiettivo confermato: 3% dalle visite alla landing agli acquisti, non dal solo carrello. Il piano di misura, le scelte e le verifiche sono in `.context/sfida-checkout-cro/README.md`. Non ci sono dati di conversione reale né garanzie di raggiungere il 3%.

Revisione visiva: il carrello usa ora Poppins e gli asset originali della sfida, con prenotazione simulata del prezzo di 37 € per cinque minuti, richiesta dall’utente. Il timer persiste nella stessa sessione e disattiva il pulsante alla scadenza; per il live serve applicare la scadenza anche sul server del pagamento. Evidenze in `.context/sfida-checkout-cro/brand-v2/`. Per verificare un server su un’altra porta, impostare `SFIDA_CHECK_BASE` eseguendo lo script `verify.py`.

## Revisione visiva della home

Su richiesta successiva, `/sfida-7-giorni` usa ora `css/sfida-home.css`: sfondi neutri, meno riquadri e decorazioni, gerarchia tipografica e spaziature semplificate. La revisione riguarda il design: testi, immagini, video, CTA e tracciamento restano quelli precedenti. Il confronto pixel zero documentato sopra si riferisce alla copia precedente, non al nuovo design. Baseline, screenshot e verifiche in `.context/sfida-home-visual/`.

## Home con riprova e movimento — 30 settembre 2026

La successiva richiesta dell'utente supera la precedente versione minimale. La landing aggiunge `css/sfida-home-motion.css` e `js/sfida-home-motion.js`: foto reali, nove contenuti di riprova recuperati dal funnel, sezioni animate e visual del programma. Poppins è servito localmente; il video iniziale ha ora una vera foto come poster. I contenuti di prova sono attribuiti ad Academy e non promettono gli stessi risultati in sette giorni.

Le animazioni rispettano le preferenze del dispositivo e possono essere messe in pausa. Video e immagini si aprono in un dialog accessibile; le tre testimonianze video si caricano solo su richiesta. I testi originali dell'offerta e le FAQ sono conservati. Carrello, prezzo, timer, API e tracciamento non cambiano. La copia pixel-identica e la prima versione minimale restano documentate come revisioni precedenti, non come descrizione del design attuale.

Fonti, screenshot, confronto dei testi e verifiche di questa revisione: `.context/sfida-home-motion/`. Il deployment rimane una preview isolata con pagamento simulato.
