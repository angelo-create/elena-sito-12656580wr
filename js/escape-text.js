// Unica fonte del testo mostrato nel browser e incluso nel PDF.
// Incrementare TEXT_VERSION per ogni modifica al documento o ai consensi.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EscapeText = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  return {
    TEXT_VERSION: 'escape-2026-v1.0',
    FOOTER_NAME: 'Escape - X77 SSD a.r.l.',
    TITOLO: 'INFORMATIVA E LIBERATORIA — ESCAPE\n30 settembre – 4 ottobre 2026 — Poggiovalle',
    EVENTO: {
      nome: 'Escape',
      date: '30 settembre – 4 ottobre 2026',
      luogo: 'Poggiovalle, Città della Pieve (PG)',
      organizzatore: 'X77 SSD a.r.l. — X-Fit Academy'
    },
    DETTAGLI_EVENTO: 'Il presente documento riguarda la partecipazione a Escape, dal 30 settembre al 4 ottobre 2026 presso Poggiovalle, Città della Pieve (PG), organizzato da X77 SSD a.r.l., P.IVA 17336811009, con sede in Via Leonardo Umile 35, 00144 Roma, con il marchio X-Fit Academy e la conduzione di Elena Giordani. La partecipazione è riservata a persone maggiorenni.',
    INFORMATIVA: `ATTIVITÀ E INFORMAZIONI PER LA PARTECIPAZIONE

Il programma comprende Metodo Easy, esercizi di respirazione, meditazione, camminate e corsa. Le attività motorie comportano sforzo fisico, con intensità da adattare alle proprie capacità e alle indicazioni degli istruttori. Camminate e corsa possono svolgersi all'aperto: terreno irregolare, scivolosità, ostacoli e condizioni meteorologiche possono aumentare il rischio di cadute, distorsioni, affaticamento e altri infortuni. Anche gli esercizi di respirazione possono causare capogiri o disagio.

Le attività hanno finalità di movimento e benessere e non costituiscono prestazioni sanitarie, diagnosi, psicoterapia o sostituti di cure e prescrizioni mediche. Non modificare terapie sulla base della partecipazione. In presenza di condizioni di salute, limitazioni, gravidanza, infortuni recenti o dubbi sulla compatibilità delle attività, consulta il medico prima di partecipare e segnala allo staff le limitazioni utili ad adattare la pratica, senza inserire diagnosi o referti in questo modulo.

Segui le indicazioni degli istruttori, utilizza abbigliamento e calzature adatti, rispetta le regole degli spazi e adegua il ritmo alle tue condizioni. Puoi interrompere o non svolgere un esercizio non adatto a te. In caso di dolore, vertigini, difficoltà respiratoria o altro malessere, interrompi l'attività e avvisa immediatamente lo staff.`,
    LIBERATORIA: `DICHIARAZIONE DI PARTECIPAZIONE CONSAPEVOLE

Dichiaro di essere maggiorenne, di aver letto e compreso le attività e i rischi descritti e di partecipare volontariamente. Mi impegno a valutare le mie condizioni rispetto alle attività proposte, a chiedere consiglio medico quando necessario, a comunicare allo staff eventuali limitazioni rilevanti e a rispettare le indicazioni ricevute.

Sono consapevole dei rischi ordinari connessi all'attività fisica e mi impegno a un comportamento prudente, anche verso gli altri partecipanti. Questa dichiarazione non esonera X77 SSD a.r.l., Elena Giordani, gli istruttori o lo staff dalle responsabilità previste dalla legge. Non limita la responsabilità per dolo, colpa grave, violazione di obblighi inderogabili o per danni alla persona derivanti da fatti od omissioni per i quali l'organizzatore o i suoi collaboratori rispondono ai sensi di legge. Restano fermi i diritti inderogabili del partecipante.

Mi impegno a rispettare la riservatezza degli altri partecipanti e a non divulgare racconti personali o informazioni sulla loro salute apprese durante l'evento.

AUTORIZZAZIONE A IMMAGINI, FOTO E VIDEO

Autorizzo a titolo gratuito X77 SSD a.r.l., per X-Fit Academy, a riprendere e utilizzare la mia immagine e voce in fotografie e video realizzati durante Escape, per documentare e promuovere le attività di X-Fit Academy sul sito e sui suoi canali social. Sono esclusi utilizzi lesivi della dignità, dell'onore o della reputazione e la diffusione di informazioni sulla salute. Posso revocare il consenso per gli utilizzi futuri scrivendo a info.xfitacademy@gmail.com; la revoca non pregiudica la liceità del trattamento precedente. L'organizzatore interromperà i nuovi utilizzi e gestirà la rimozione dai canali sotto il proprio controllo, nei limiti applicabili.`,
    CLAUSOLA_FIRMA_DIGITALE: `FIRMA ELETTRONICA SEMPLICE

Con il pulsante “Conferma e firma” sottoscrivo il documento con la firma tracciata sullo schermo. Si tratta di firma elettronica semplice (FES), non di firma digitale qualificata. Il suo valore probatorio è valutabile ai sensi dell'art. 20 del D.Lgs. 82/2005 e del Regolamento UE 910/2014; non è garantita automaticamente l'equivalenza a una firma qualificata.

Il PDF contiene il testo e la versione sottoscritti, i dati dichiarati, le scelte espresse, la firma, data e ora UTC, indirizzo IP e informazioni sul browser. L'hash SHA-256 viene calcolato sul PDF definitivo e conservato separatamente nel registro della firma su GoHighLevel. Questi elementi documentano l'operazione e consentono il confronto dell'integrità del file; non costituiscono una verifica autonoma dell'identità né una marca temporale qualificata.`,
    PRIVACY_NOTICE: `INFORMATIVA PRIVACY — ART. 13 REGOLAMENTO UE 2016/679

1. Titolare. X77 SSD a.r.l., P.IVA 17336811009, Via Leonardo Umile 35, 00144 Roma. Contatto per richieste e diritti: info.xfitacademy@gmail.com.

2. Dati e finalità. Dati anagrafici e di contatto, dichiarazioni di partecipazione e documento firmato sono utilizzati per gestire la partecipazione a Escape e i relativi adempimenti, sulla base dell'esecuzione del rapporto e degli obblighi di legge (art. 6.1.b e c GDPR). Firma e metadati sono conservati anche per documentare l'adesione e tutelare i diritti del titolare (art. 6.1.f). Il modulo non richiede diagnosi, referti o anamnesi.

3. Immagini. Fotografie, video e voce sono trattati per documentazione e promozione di X-Fit Academy sul sito e sui canali social, sulla base del consenso (art. 6.1.a), secondo l'autorizzazione riportata nel documento. Questo modulo raccoglie tale autorizzazione insieme all'accettazione della partecipazione. Per richieste relative alle riprese e alla revoca, contatta il titolare.

4. Newsletter. Solo se selezioni la casella facoltativa, l'indirizzo email sarà utilizzato per contenuti, iniziative e novità X-Fit Academy, sulla base del consenso (art. 6.1.a). Il rifiuto non impedisce la partecipazione. Puoi disiscriverti o revocare il consenso in qualsiasi momento. Le comunicazioni di servizio relative alla firma non dipendono dall'iscrizione alla newsletter.

5. Conferimento. I dati necessari a identificare il partecipante e registrare la firma sono richiesti per completare questo modulo. Il modulo prevede un'accettazione unica per partecipazione, presa visione privacy e autorizzazione immagini; la newsletter ha una scelta separata. Nessuna casella è preselezionata.

6. Destinatari e strumenti. I dati sono trattati dal personale autorizzato e dai fornitori dei servizi informatici e organizzativi necessari. Il sito utilizza Vercel e l'archivio e la gestione dei contatti utilizzano GoHighLevel. I PDF contengono dati personali e firma: conserva il link con cura e non condividerlo pubblicamente. Le immagini autorizzate possono essere visibili agli utenti dei canali sui quali sono pubblicate. Eventuali trasferimenti fuori dallo Spazio economico europeo devono essere assistiti dalle garanzie previste dal capo V GDPR; informazioni sui fornitori e sulle garanzie applicabili sono disponibili presso il titolare.

7. Conservazione. Il documento firmato e i relativi metadati sono conservati per la gestione del rapporto e la tutela dei diritti, fino a dieci anni dalla sua conclusione, salvo esigenze di conservazione connesse a controversie. I dati per newsletter sono utilizzati fino alla revoca e comunque non oltre 24 mesi da questo consenso senza rinnovo. Le immagini sono utilizzate fino alla revoca e comunque non oltre 24 mesi dalla conclusione dell'evento; l'eventuale prova del consenso può essere conservata per la tutela dei diritti.

8. Diritti. Nei casi previsti puoi chiedere accesso, rettifica, cancellazione, limitazione, portabilità e opposizione al trattamento, nonché revocare i consensi senza pregiudicare i trattamenti precedenti. Puoi presentare reclamo al Garante per la protezione dei dati personali. Non sono previste decisioni automatizzate attraverso questo modulo.`,
    HASH_NOTICE: "L'hash SHA-256 del PDF definitivo è conservato nella nota di archivio della singola firma su GoHighLevel, insieme al suo identificativo. I campi Escape del contatto mostrano solo la firma più recente; le note mantengono lo storico. Per verificare il file, confrontare il suo hash con quello della nota corrispondente.",
    CONSENSI: {
      OBBLIGATORIO: { obbligatorio: true, label: "Confermo di essere maggiorenne, di aver letto e accettato l'informativa sulle attività e la dichiarazione di partecipazione a Escape. Prendo visione dell'informativa privacy e autorizzo l'utilizzo della mia immagine e voce in foto e video sui canali X-Fit Academy, nei termini descritti nel documento." },
      NEWSLETTER: { obbligatorio: false, label: 'Voglio ricevere via email contenuti, iniziative e novità di X-Fit Academy. Posso revocare il consenso in qualsiasi momento.' }
    }
  };
});
