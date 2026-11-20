// Funnel «Mangio meno e non dimagrisco»: funzioni comuni alle pagine
// (mangio-meno, -risultato, -lezioni, -candidatura, -grazie).
// Va caricato dopo /js/utm-capture.js.
//
// Cosa tiene insieme il funnel:
// - `p` (profilo) e `c` (id contatto GHL) passano di pagina in pagina nell'URL;
// - gli UTM della prima pagina viaggiano nell'URL e in sessionStorage (utm-capture.js),
//   cosi' arrivano fino alla candidatura e al calendario;
// - nome, email e WhatsApp restano in sessionStorage (chiave `mm-contatto`), mai nell'URL.
(function () {
  'use strict';

  var ID_RE = /^[A-Za-z0-9]{15,40}$/;
  var PROFILI = ['risparmio', 'pancia', 'muscolo'];
  var UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var CHIAVE = 'mm-contatto';

  // GHL a volte scrive gli `=` dei merge field come `#x3D;`, e il `#` spezza
  // la query string: va rimesso a posto prima di leggere i parametri.
  function leggiParametri() {
    var fixed = location.href.replace(/#x3D;/g, '%3D');
    var q = fixed.indexOf('?');
    var s = q > -1 ? fixed.substring(q) : '';
    var h = s.indexOf('#');
    if (h > -1) s = s.substring(0, h);
    return new URLSearchParams(s);
  }

  function leggi() {
    try {
      var d = JSON.parse(sessionStorage.getItem(CHIAVE) || '{}');
      return d && typeof d === 'object' ? d : {};
    } catch (e) { return {}; }
  }

  function salva(dati) {
    try {
      var d = leggi();
      Object.keys(dati).forEach(function (k) {
        if (dati[k] !== undefined && dati[k] !== null && dati[k] !== '') d[k] = dati[k];
      });
      sessionStorage.setItem(CHIAVE, JSON.stringify(d));
    } catch (e) {}
  }

  var params = leggiParametri();
  var memoria = leggi();

  var c = params.get('c') || '';
  if (!ID_RE.test(c)) c = ID_RE.test(memoria.c || '') ? memoria.c : '';
  var p = params.get('p') || '';
  if (PROFILI.indexOf(p) < 0) p = PROFILI.indexOf(memoria.p) > -1 ? memoria.p : '';
  if (c || p) salva({ c: c, p: p });

  // UTM: prima quelli nell'URL, poi quelli salvati da utm-capture.js (primo atterraggio).
  function utm() {
    var a = typeof window.getAttribution === 'function' ? window.getAttribution() : {};
    var o = {};
    UTM.forEach(function (k) {
      var v = params.get(k) || (a && a[k]) || '';
      if (v) o[k] = String(v).slice(0, 200);
    });
    return o;
  }

  // Link a un'altra pagina del funnel con p, c e UTM. `extra` aggiunge o sostituisce parametri.
  function link(percorso, extra) {
    var q = new URLSearchParams();
    if (p) q.set('p', p);
    if (c) q.set('c', c);
    var u = utm();
    Object.keys(u).forEach(function (k) { q.set(k, u[k]); });
    if (extra) Object.keys(extra).forEach(function (k) {
      if (extra[k] === '' || extra[k] === null || extra[k] === undefined) q.delete(k);
      else q.set(k, extra[k]);
    });
    var s = q.toString();
    return percorso + (s ? '?' + s : '');
  }

  // Eventi per Meta: stessi nomi di META_MANGIO_MENO in api/replay-evento.js.
  var META = {
    'lezione-1-avviata': ['LezioneAvviata', 'Lezione 1 Mangio meno'],
    'lezione-2-avviata': ['LezioneAvviata', 'Lezione 2 Mangio meno'],
    'lezione-3-avviata': ['LezioneAvviata', 'Lezione 3 Mangio meno'],
    'lezione-1-finita': ['LezioneFinita', 'Lezione 1 Mangio meno'],
    'lezione-2-finita': ['LezioneFinita', 'Lezione 2 Mangio meno'],
    'lezione-3-finita': ['LezioneFinita', 'Lezione 3 Mangio meno'],
    'clic-candidatura': ['ClicCandidatura', 'Candidatura Mangio meno'],
    'clic-whatsapp': ['ClicWhatsApp', 'WhatsApp Mangio meno']
  };

  // Lezione avviata o finita, clic sulla candidatura o su WhatsApp: una volta per evento su
  // questo dispositivo (e per contatto, se la pagina lo conosce).
  // - a Meta: evento del pixel nel browser con un eventID;
  // - se la pagina conosce l'id del contatto, ad api/replay-evento.js, che mette
  //   il tag `mangio-meno-<evento>` in GHL e manda lo stesso evento via CAPI con lo
  //   stesso eventID (Meta ne tiene uno).
  function crm(evento) {
    var chiave = 'mm-crm-' + (c || 'anonimo') + '-' + evento;
    try {
      if (localStorage.getItem(chiave)) return;
      localStorage.setItem(chiave, '1');
    } catch (e) {}
    var id = eventId('mm');
    var meta = META[evento];
    if (meta && typeof window.fbq === 'function') {
      try { window.fbq('trackCustom', meta[0], { content_name: meta[1], content_category: 'mangio-meno' }, { eventID: id }); } catch (e) {}
    }
    if (!c) return;
    var corpo = JSON.stringify({
      c: c, replay: 'mangio-meno', evento: evento, event_id: id,
      fbc: cookie('_fbc'), fbp: cookie('_fbp'),
      // senza query string: l'URL della pagina contiene l'id del contatto
      event_source_url: location.origin + location.pathname,
      user_agent: navigator.userAgent
    });
    try {
      // keepalive: la richiesta parte anche se la persona sta lasciando la pagina
      fetch('/api/replay-evento', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: corpo, keepalive: true, credentials: 'omit'
      }).catch(function () {});
    } catch (e) {
      try { navigator.sendBeacon('/api/replay-evento', new Blob([corpo], { type: 'application/json' })); } catch (e2) {}
    }
  }

  function cookie(nome) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + nome.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  function eventId(prefisso) {
    return prefisso + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
  }

  // Numero senza prefisso = italiano (+39), come api/_lib/normalize-phone.js.
  function telefonoInternazionale(raw) {
    var t = String(raw || '').trim().replace(/[^\d+]/g, '');
    if (!t) return '';
    if (t.indexOf('00') === 0) t = '+' + t.slice(2);
    if (t.charAt(0) === '+') return '+' + t.slice(1).replace(/\+/g, '');
    t = t.replace(/\+/g, '');
    if (/^39\d{9,10}$/.test(t)) return '+' + t;
    return '+39' + t;
  }

  // Pulsante «Scrivi al mio team su WhatsApp» (elementi con data-whatsapp).
  // Stesso numero da cui parte il WhatsApp automatico del quiz, cosi' la chat e' una sola.
  // Il testo precompilato dice a Flinky da dove arriva la persona e ci fa contare chi
  // scrive da sola (in GHL il workflow aspetta 10 minuti prima del messaggio automatico).
  // Deve restare uguale al redirect /whatsapp-check-up di vercel.json (usato nelle email):
  // il test lo controlla. Nell'HTML l'href e' gia' /whatsapp-check-up, cosi' funziona anche senza JS.
  var WHATSAPP = 'https://wa.me/393773692181?text=Ciao%20Elena%21%20Ho%20fatto%20il%20Check-Up%20e%20vorrei%20sapere%20come%20funziona%20l%27X-Fit%20Academy.';

  function collegaWhatsapp() {
    document.querySelectorAll('[data-whatsapp]').forEach(function (a) {
      a.href = WHATSAPP;
      a.addEventListener('click', function () { crm('clic-whatsapp'); });
    });
  }

  // Il riquadro del video prende le proporzioni vere del file (orizzontale o verticale).
  function adattaVideo(video) {
    var box = video.parentNode;
    function applica() {
      var w = video.videoWidth, h = video.videoHeight;
      if (!w || !h) return;
      box.style.aspectRatio = w + ' / ' + h;
      if (h > w) box.style.maxWidth = 'calc(78vh * ' + (w / h).toFixed(4) + ')';
    }
    if (video.readyState >= 1) applica();
    video.addEventListener('loadedmetadata', applica);
  }

  window.MM = {
    params: params,
    contactId: c,
    profilo: p,
    leggi: leggi,
    salva: salva,
    utm: utm,
    link: link,
    crm: crm,
    cookie: cookie,
    eventId: eventId,
    telefonoInternazionale: telefonoInternazionale,
    adattaVideo: adattaVideo,
    whatsapp: WHATSAPP,
    ID_RE: ID_RE
  };

  // Gli script vanno in fondo al body: i pulsanti ci sono gia'.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', collegaWhatsapp);
  else collegaWhatsapp();
})();
