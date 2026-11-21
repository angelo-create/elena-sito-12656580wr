// /api/ebook-pancia-lead: richiesta dell'ebook gratuito «La pancia che non se ne va»
// (ebook-pancia.html). Stesse regole di api/mangio-meno-lead.js:
//
// 1. upsert del contatto SENZA tag (api/README.md, REGOLA #1), UTM con buildUtmPayload;
//    niente `source`: sui contatti gia' presenti in GHL la sovrascriverebbe;
// 2. tag `ebook-pancia` aggiunto dopo, con POST /contacts/{id}/tags (additivo).
//    E' il tag da cui deve partire il workflow GHL di consegna (email e WhatsApp);
// 3. una nota sul contatto con la data del consenso;
// 4. Lead a Meta CAPI sui due pixel, con lo stesso event_id del pixel nel browser
//    (content_name «Ebook La pancia che non se ne va», per la conversione personalizzata).
//
// Campo `sito` nascosto nel modulo: lo riempiono solo i bot. Se arriva pieno si
// risponde come se fosse andato tutto bene, senza scrivere niente in GHL ne' a Meta.
//
// Risponde { success, contactId }. Nei log niente dati personali.

const mm = require('./_lib/mangio-meno');

const ETICHETTA = 'ebook-pancia-lead';
const LANDING = 'https://go.elenagiordani.com/ebook-pancia';
const TAG = 'ebook-pancia';
const CONTENUTO = 'Ebook La pancia che non se ne va';

function nota() {
  return [
    'Ebook «La pancia che non se ne va» richiesto da go.elenagiordani.com/ebook-pancia',
    `Consenso privacy e messaggi: accettato il ${new Date().toISOString().slice(0, 10)}`
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

  if (typeof body.sito === 'string' && body.sito.trim() !== '') {
    console.warn(`[${ETICHETTA}] campo nascosto pieno: invio scartato`);
    return res.status(200).json({ success: true, contactId: null });
  }

  const contatto = mm.validaContatto(body);
  if (contatto.errore) return mm.rispondiErrore(res, 400, contatto.errore);
  if (body.consenso !== true) return mm.rispondiErrore(res, 400, 'Consenso mancante');

  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) {
    console.error(`[${ETICHETTA}] GHL_API_KEY mancante`);
    return mm.rispondiErrore(res, 500, 'Invio non riuscito');
  }

  let contactId;
  try {
    contactId = await mm.upsertContatto(apiKey, contatto, body, ETICHETTA);
  } catch (err) {
    if (err.message !== 'upsert') console.error(`[${ETICHETTA}] errore upsert:`, err.name);
    return mm.rispondiErrore(res, 502, 'Invio non riuscito');
  }

  console.log(`[${ETICHETTA}] contatto salvato |`, mm.breve(contactId));

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
      customData: { content_name: CONTENUTO, content_category: 'ebook' },
      etichetta: ETICHETTA
    })
  ];
  if (contactId) {
    lavori.push(mm.aggiungiTag(apiKey, contactId, [TAG], ETICHETTA));
    lavori.push(mm.aggiungiNota(apiKey, contactId, nota(), ETICHETTA));
  }
  await Promise.allSettled(lavori);

  return res.status(200).json({ success: true, contactId });
};

module.exports.TAG = TAG;
module.exports.CONTENUTO = CONTENUTO;
