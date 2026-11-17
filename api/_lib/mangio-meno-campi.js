// Campi personalizzati GHL del funnel «Mangio meno e non dimagrisco»
// (location whfxv9CQCrjAmBTZJwMw), creati via API il 17/11/2026.
//
// Le risposte del Check-Up e della candidatura vanno qui oltre che nella nota,
// cosi' si possono usare in filtri, smart list, workflow e report.
// Sono tutti campi di testo, mai menu a tendina: un valore fuori elenco
// farebbe rifiutare a GHL tutto l'upsert e il contatto andrebbe perso.
// Chiave per email e template: {{contact.mangio_meno_<nome>}}.

const quiz = require('../../js/mangio-meno-quiz.js');

const ID = {
  eta: '80pRsA9qpRPdv0gpEfEe',              // Mangio meno · Età
  ciclo: 'PSOfL17iyT6bF7qABbyV',            // Mangio meno · Ciclo
  corpo: 'hlsqCXl37JYjqNKx4eUX',            // Mangio meno · Dove è cambiato il corpo
  mangiare_meno: 'xp3hfFmy2t7VskiqXPtW',    // Mangio meno · Quando mangia meno
  allenamento: '743Tl9Ze9uMHFLD6VzPc',      // Mangio meno · Allenamento
  colazione: 'dC16bvxKoScc7we5tOLj',        // Mangio meno · Colazione
  sonno: 'serquJSdrM1jHnaJyRUX',            // Mangio meno · Sonno
  profilo: '9OZ4EmId6urWGxKq6z8N',          // Mangio meno · Profilo (risparmio, pancia, muscolo)
  obiettivo: 'US79rSLwaxxbrQpT3VUH',        // Mangio meno · Obiettivo (testo libero della candidatura)
  anno: 'H7RUH8Mb694pexlFPaKS',             // Mangio meno · Sa che l'Academy dura un anno
  investire: 'AO0K6ivPJCqL35fXGFVo',        // Mangio meno · Pronta a investire ogni mese
  iniziare: 'GghynStOWwD2vtP3l0ow',         // Mangio meno · Può iniziare entro 15 giorni
  call: 'm0bxJocUevHXrNTOKRjD'              // Mangio meno · Ci sarà alla call
};

// Domanda del quiz -> campo.
const CAMPO_DOMANDA = {
  d1: 'eta', d2: 'ciclo', d3: 'corpo', d4: 'mangiare_meno', d5: 'allenamento', d6: 'colazione', d7: 'sonno'
};

// Risposte del Check-Up (gia' validate) e profilo calcolato dal server.
// Nel campo va il testo della risposta come lo vede la persona.
function campiQuiz(risposte, profilo) {
  const campi = [];
  for (const d of quiz.DOMANDE) {
    const r = d.risposte.find((x) => x.id === risposte[d.id]);
    if (r && ID[CAMPO_DOMANDA[d.id]]) campi.push({ id: ID[CAMPO_DOMANDA[d.id]], value: r.testo });
  }
  if (profilo) campi.push({ id: ID.profilo, value: profilo });
  return campi;
}

// Candidatura: obiettivo scritto da lei e le 4 risposte sì/no (anno, investire, iniziare, call).
function campiCandidatura(obiettivo, risposte) {
  const campi = [];
  if (obiettivo) campi.push({ id: ID.obiettivo, value: obiettivo });
  for (const k of ['anno', 'investire', 'iniziare', 'call']) {
    if (risposte[k] === 'si' || risposte[k] === 'no') campi.push({ id: ID[k], value: risposte[k] === 'si' ? 'Sì' : 'No' });
  }
  return campi;
}

module.exports = { ID, campiQuiz, campiCandidatura };
