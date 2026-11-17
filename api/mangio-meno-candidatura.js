// /api/mangio-meno-candidatura: candidatura alla X-Fit Academy dal funnel
// «Mangio meno e non dimagrisco» (mangio-meno-candidatura.html).
//
// 1. upsert del contatto SENZA tag (api/README.md, REGOLA #1), UTM con buildUtmPayload.
//    GHL riconosce la persona da email e telefono. Il `c` della pagina (id del
//    contatto del quiz) non si usa per scrivere sul contatto: un link inoltrato
//    a un'amica porterebbe i dati di lei sulla scheda di un'altra persona.
//    Se l'upsert trova un contatto diverso da `c`, lo si segnala nel log.
// 2. tag additivi: mangio-meno-candidatura + mangio-meno-qualificata
//    (le 4 risposte sì/no tutte «sì») oppure mangio-meno-non-qualificata;
// 3. una nota sul contatto con le risposte; obiettivo e risposte sì/no vanno anche
//    nei campi «Mangio meno · …» (api/_lib/mangio-meno-campi.js);
// 4. SubmitApplication a Meta CAPI, solo per le qualificate, con lo stesso
//    event_id del pixel nel browser.
//
// Risponde { success, contactId, qualificata }. Nei log niente dati personali.

const mm = require('./_lib/mangio-meno');
const campiGhl = require('./_lib/mangio-meno-campi');

const ETICHETTA = 'mangio-meno-candidatura';
const PAGINA = 'https://go.elenagiordani.com/mangio-meno-candidatura';
const MAX_OBIETTIVO = 500;

// Le 4 domande sì/no, con il testo della pagina (per la nota in GHL).
const DOMANDE_SI_NO = [
  { id: 'anno', testo: 'Sai che la X-Fit Academy è un percorso di un anno?' },
  { id: 'investire', testo: 'Sei pronta a investire su di te ogni mese? Il costo e le rate te li spiega Marco in call.' },
  { id: 'iniziare', testo: 'Puoi iniziare entro 15 giorni?' },
  { id: 'call', testo: 'Ci sarai alla call, nel giorno e all’ora che scegli?' }
];

function nota(obiettivo, risposte, qualificata) {
  return [
    'Candidatura X-Fit Academy dal funnel «Mangio meno e non dimagrisco» (go.elenagiordani.com/mangio-meno-candidatura)',
    `Esito: ${qualificata ? 'qualificata (4 risposte sì): vede il calendario di Marco' : 'non qualificata: vede la Sfida di 7 giorni'}`,
    '',
    `1. Qual è il tuo obiettivo principale? ${obiettivo}`,
    ...DOMANDE_SI_NO.map((d, i) => `${i + 2}. ${d.testo} ${risposte[d.id] === 'si' ? 'Sì' : 'No'}`)
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

  const obiettivo = mm.testo(body.obiettivo);
  if (!obiettivo) return mm.rispondiErrore(res, 400, 'Obiettivo obbligatorio');
  if (obiettivo.length > MAX_OBIETTIVO) return mm.rispondiErrore(res, 400, 'Obiettivo troppo lungo');

  const risposte = {};
  for (const d of DOMANDE_SI_NO) {
    const v = body[d.id];
    if (v !== 'si' && v !== 'no') return mm.rispondiErrore(res, 400, 'Risposte non valide');
    risposte[d.id] = v;
  }
  const qualificata = DOMANDE_SI_NO.every((d) => risposte[d.id] === 'si');
  const cPagina = typeof body.c === 'string' && mm.ID_RE.test(body.c) ? body.c : '';

  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) {
    console.error(`[${ETICHETTA}] GHL_API_KEY mancante`);
    return mm.rispondiErrore(res, 500, 'Invio non riuscito');
  }

  let contactId;
  try {
    contactId = await mm.upsertContatto(apiKey, {
      ...contatto, campi: campiGhl.campiCandidatura(obiettivo, risposte)
    }, body, ETICHETTA);
  } catch (err) {
    if (err.message !== 'upsert') console.error(`[${ETICHETTA}] errore upsert:`, err.name);
    return mm.rispondiErrore(res, 502, 'Invio non riuscito');
  }

  console.log(`[${ETICHETTA}] candidatura salvata | qualificata:`, qualificata, '|', mm.breve(contactId));
  if (cPagina && contactId && cPagina !== contactId) {
    console.warn(`[${ETICHETTA}] contatto diverso da quello del link: ?c=${mm.breve(cPagina)}, upsert ${mm.breve(contactId)}`);
  }

  const tags = ['mangio-meno-candidatura', qualificata ? 'mangio-meno-qualificata' : 'mangio-meno-non-qualificata'];
  const lavori = [];
  if (contactId) {
    lavori.push(mm.aggiungiTag(apiKey, contactId, tags, ETICHETTA));
    lavori.push(mm.aggiungiNota(apiKey, contactId, nota(obiettivo, risposte, qualificata), ETICHETTA));
  }
  if (qualificata) {
    lavori.push(mm.inviaCapi({
      eventName: 'SubmitApplication',
      eventId: body.event_id,
      email: contatto.email,
      firstName: contatto.firstName,
      phone: contatto.phone,
      contactId,
      richiesta: mm.datiRichiesta(req, body),
      sourceUrlPredefinito: PAGINA,
      customData: { content_name: 'Candidatura Academy Mangio meno', content_category: 'candidatura' },
      etichetta: ETICHETTA
    }));
  }
  await Promise.allSettled(lavori);

  return res.status(200).json({ success: true, contactId, qualificata });
};
