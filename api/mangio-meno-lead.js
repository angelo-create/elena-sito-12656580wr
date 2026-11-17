// /api/mangio-meno-lead: invio del Check-Up «Mangio meno e non dimagrisco»
// (mangio-meno.html). Stesso comportamento di api/webinar-lead.js:
//
// 1. upsert del contatto SENZA tag (api/README.md, REGOLA #1), UTM con buildUtmPayload;
// 2. tag aggiunti dopo, con POST /contacts/{id}/tags (additivo):
//    mangio-meno-quiz, mangio-meno-profilo-<profilo>, e se servono mangio-meno-sonno
//    e mangio-meno-eta. Il workflow GHL di email e WhatsApp parte da mangio-meno-quiz;
// 3. una nota sul contatto con le 7 risposte in chiaro;
// 4. Lead a Meta CAPI sui due pixel, con lo stesso event_id del pixel nel browser.
//
// Il profilo si ricalcola qui con lo stesso file del browser (js/mangio-meno-quiz.js):
// i tag dipendono dalle risposte, non da quello che dice il client.
//
// Risponde { success, contactId }. Nei log niente dati personali.

const quiz = require('../js/mangio-meno-quiz.js');
const mm = require('./_lib/mangio-meno');

const ETICHETTA = 'mangio-meno-lead';
const LANDING = 'https://go.elenagiordani.com/mangio-meno';

function nota(esito, risposte) {
  const riquadri = [esito.sonno ? 'sonno' : '', esito.eta ? 'età' : ''].filter(Boolean);
  return [
    'Check-Up «Mangio meno e non dimagrisco» (go.elenagiordani.com/mangio-meno)',
    `Profilo: ${quiz.TITOLI[esito.profilo]} (${esito.profilo})`,
    `Riquadri in più nel risultato: ${riquadri.length ? riquadri.join(', ') : 'nessuno'}`,
    `Punti: risparmio ${esito.punti.risparmio} · pancia ${esito.punti.pancia} · muscolo ${esito.punti.muscolo}`,
    `Consenso privacy e messaggi: accettato il ${new Date().toISOString().slice(0, 10)}`,
    '',
    ...quiz.riepilogo(risposte)
  ].join('\n');
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return mm.rispondiErrore(res, 405, 'Method not allowed');
  }

  const body = mm.parseBody(req);
  if (!body) return mm.rispondiErrore(res, 400, 'Richiesta non valida');

  const contatto = mm.validaContatto(body);
  if (contatto.errore) return mm.rispondiErrore(res, 400, contatto.errore);
  if (body.consenso !== true) return mm.rispondiErrore(res, 400, 'Consenso mancante');
  const risposte = quiz.validaRisposte(body.risposte);
  if (!risposte) return mm.rispondiErrore(res, 400, 'Risposte non valide');

  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) {
    console.error(`[${ETICHETTA}] GHL_API_KEY mancante`);
    return mm.rispondiErrore(res, 500, 'Invio non riuscito');
  }

  const esito = quiz.calcolaProfilo(risposte);

  let contactId;
  try {
    contactId = await mm.upsertContatto(apiKey, { ...contatto, source: 'mangio-meno-quiz' }, body, ETICHETTA);
  } catch (err) {
    if (err.message !== 'upsert') console.error(`[${ETICHETTA}] errore upsert:`, err.name);
    return mm.rispondiErrore(res, 502, 'Invio non riuscito');
  }

  console.log(`[${ETICHETTA}] contatto salvato | profilo:`, esito.profilo, '| sonno:', esito.sonno, '| eta:', esito.eta, '|', mm.breve(contactId));

  const tags = ['mangio-meno-quiz', `mangio-meno-profilo-${esito.profilo}`];
  if (esito.sonno) tags.push('mangio-meno-sonno');
  if (esito.eta) tags.push('mangio-meno-eta');

  const lavori = [
    mm.inviaCapi({
      eventName: 'Lead',
      eventId: body.event_id,
      email: contatto.email,
      firstName: contatto.firstName,
      phone: contatto.phone,
      contactId,
      richiesta: mm.datiRichiesta(req, body),
      sourceUrlPredefinito: LANDING,
      customData: { content_name: 'Check-Up Mangio meno', content_category: 'quiz' },
      etichetta: ETICHETTA
    })
  ];
  if (contactId) {
    lavori.push(mm.aggiungiTag(apiKey, contactId, tags, ETICHETTA));
    lavori.push(mm.aggiungiNota(apiKey, contactId, nota(esito, risposte), ETICHETTA));
  }
  await Promise.allSettled(lavori);

  return res.status(200).json({ success: true, contactId });
};
