// Check-Up «Mangio meno e non dimagrisco»: domande, risposte e calcolo del profilo.
//
// Un solo file per browser e server: lo carica mangio-meno.html (window.MangioMenoQuiz)
// e lo importa api/mangio-meno-lead.js, che ricalcola il profilo dalle risposte.
// Cosi' i tag in GHL e il risultato mostrato alla persona non possono divergere.
//
// Testi e regole di punteggio: ads/mangio-meno/COPY.md, sezione «Come si calcola il profilo».
// Profili: A = risparmio, B = pancia, C = muscolo.
// Vince il profilo con piu' punti; a parita' vince B, poi A, poi C.
// Riquadro `sonno`: D7 diversa da «Bene» e profilo diverso da B.
// Riquadro `eta`: D1 da 55 in su, oppure D2 «In menopausa da piu' di 5 anni».
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MangioMenoQuiz = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DOMANDE = [
    { id: 'd1', testo: 'Quanti anni hai?', risposte: [
      { id: 'meno-40', testo: 'Meno di 40' },
      { id: '40-44', testo: '40-44' },
      { id: '45-49', testo: '45-49' },
      { id: '50-54', testo: '50-54' },
      { id: '55-59', testo: '55-59', eta: true },
      { id: '60-piu', testo: '60 o più', eta: true }
    ] },
    { id: 'd2', testo: 'Com’è il tuo ciclo oggi?', risposte: [
      { id: 'regolare', testo: 'Regolare' },
      { id: 'irregolare', testo: 'Irregolare, a volte salta', punti: { B: 1 } },
      { id: 'menopausa-meno-5', testo: 'In menopausa da meno di 5 anni', punti: { B: 1 } },
      { id: 'menopausa-piu-5', testo: 'In menopausa da più di 5 anni', punti: { B: 1 }, eta: true }
    ] },
    { id: 'd3', testo: 'Dove è cambiato di più il tuo corpo negli ultimi anni?', risposte: [
      { id: 'pancia-fianchi', testo: 'La pancia e i fianchi', punti: { B: 2 } },
      { id: 'braccia-reggiseno', testo: 'Dietro le braccia e sotto il reggiseno', punti: { A: 1, C: 1 } },
      { id: 'gonfia', testo: 'Mi sento gonfia un po’ ovunque', punti: { A: 1, B: 1 } },
      { id: 'tono-forza', testo: 'Ho perso tono e forza', punti: { C: 2 } }
    ] },
    { id: 'd4', testo: 'Cosa succede quando provi a mangiare meno?', risposte: [
      { id: 'non-perdo', testo: 'Non perdo niente', punti: { A: 2 } },
      { id: 'perdo-riprendo', testo: 'Perdo qualche chilo e poi lo riprendo', punti: { A: 2 } },
      { id: 'svuotata', testo: 'Perdo peso, ma mi sento svuotata e molle', punti: { C: 2 } },
      { id: 'mai-provato', testo: 'Non ci ho mai provato davvero', punti: { B: 1 } }
    ] },
    { id: 'd5', testo: 'Come ti alleni oggi?', risposte: [
      { id: 'quasi-mai', testo: 'Quasi mai', punti: { A: 1 } },
      { id: 'cardio', testo: 'Cammino o faccio cardio, anche tanto', punti: { C: 2 } },
      { id: 'palestra-senza-forza', testo: 'Palestra o corsi, ma senza un lavoro di forza', punti: { A: 1, C: 1 } },
      { id: 'forza-2', testo: 'Faccio forza almeno due volte a settimana', punti: { B: 1 } }
    ] },
    { id: 'd6', testo: 'Com’è di solito la tua colazione?', risposte: [
      { id: 'salto', testo: 'La salto', punti: { A: 2 } },
      { id: 'dolce', testo: 'Caffè e qualcosa di dolce: biscotti, fette biscottate, brioche', punti: { A: 1, B: 1 } },
      { id: 'proteine', testo: 'Uova, yogurt o altre proteine', punti: { C: 1 } },
      { id: 'cambia', testo: 'Cambia ogni giorno', punti: { A: 1 } }
    ] },
    { id: 'd7', testo: 'Come dormi?', risposte: [
      { id: 'bene', testo: 'Bene' },
      { id: 'sveglio-notte', testo: 'Mi sveglio di notte', punti: { B: 1 }, sonno: true },
      { id: 'fatico', testo: 'Fatico ad addormentarmi', punti: { B: 1 }, sonno: true },
      { id: 'sveglio-stanca', testo: 'Mi sveglio già stanca', punti: { B: 1 }, sonno: true }
    ] }
  ];

  var PROFILI = { A: 'risparmio', B: 'pancia', C: 'muscolo' };
  var TITOLI = {
    risparmio: 'Il tuo corpo è in modalità risparmio',
    pancia: 'La tua pancia ti sta mandando un segnale',
    muscolo: 'Ti muovi tanto, ma ti manca il muscolo'
  };
  // Ordine di spareggio: a parita' di punti vince B, poi A, poi C.
  var SPAREGGIO = ['B', 'A', 'C'];

  function trovaRisposta(domanda, valore) {
    for (var i = 0; i < domanda.risposte.length; i++) {
      if (domanda.risposte[i].id === valore) return domanda.risposte[i];
    }
    return null;
  }

  // Restituisce le 7 risposte pulite ({d1: 'id', ...}) oppure null se ne
  // manca una o ce n'e' una che non esiste. Ignora qualsiasi altra chiave.
  function validaRisposte(risposte) {
    if (!risposte || typeof risposte !== 'object') return null;
    var pulite = {};
    for (var i = 0; i < DOMANDE.length; i++) {
      var d = DOMANDE[i];
      var v = Object.prototype.hasOwnProperty.call(risposte, d.id) ? risposte[d.id] : null;
      if (typeof v !== 'string' || !trovaRisposta(d, v)) return null;
      pulite[d.id] = v;
    }
    return pulite;
  }

  // Calcola il profilo. Accetta anche risposte parziali (le mancanti non danno punti).
  function calcolaProfilo(risposte) {
    risposte = risposte || {};
    var punti = { A: 0, B: 0, C: 0 };
    var sonnoDisturbato = false;
    var eta = false;
    DOMANDE.forEach(function (d) {
      var r = typeof risposte[d.id] === 'string' ? trovaRisposta(d, risposte[d.id]) : null;
      if (!r) return;
      if (r.punti) Object.keys(r.punti).forEach(function (k) { punti[k] += r.punti[k]; });
      if (r.sonno) sonnoDisturbato = true;
      if (r.eta) eta = true;
    });
    var vincente = SPAREGGIO[0];
    SPAREGGIO.forEach(function (k) { if (punti[k] > punti[vincente]) vincente = k; });
    var profilo = PROFILI[vincente];
    return {
      profilo: profilo,
      punti: { risparmio: punti.A, pancia: punti.B, muscolo: punti.C },
      sonno: sonnoDisturbato && profilo !== 'pancia',
      eta: eta
    };
  }

  // Le risposte in chiaro, una riga per domanda (per la nota sul contatto in GHL).
  function riepilogo(risposte) {
    return DOMANDE.map(function (d, i) {
      var r = risposte && typeof risposte[d.id] === 'string' ? trovaRisposta(d, risposte[d.id]) : null;
      return (i + 1) + '. ' + d.testo + ' ' + (r ? r.testo : '(senza risposta)');
    });
  }

  return {
    DOMANDE: DOMANDE,
    TITOLI: TITOLI,
    PROFILI: ['risparmio', 'pancia', 'muscolo'],
    validaRisposte: validaRisposte,
    calcolaProfilo: calcolaProfilo,
    riepilogo: riepilogo
  };
});
