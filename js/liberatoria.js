(function () {
  'use strict';

  const TOTAL_STEPS = 6;
  const PROVINCE_IT = ['AG','AL','AN','AO','AP','AQ','AR','AT','AV','BA','BG','BI','BL','BN','BO','BR','BS','BT','BZ','CA','CB','CE','CH','CL','CN','CO','CR','CS','CT','CZ','EN','FC','FE','FG','FI','FM','FR','GE','GO','GR','IM','IS','KR','LC','LE','LI','LO','LT','LU','MB','MC','ME','MI','MN','MO','MS','MT','NA','NO','NU','OR','PA','PC','PD','PE','PG','PI','PN','PO','PR','PT','PU','PV','PZ','RA','RC','RE','RG','RI','RM','RN','RO','SA','SI','SO','SP','SR','SS','SU','SV','TA','TE','TN','TO','TP','TR','TS','TV','UD','VA','VB','VC','VE','VI','VR','VT','VV'];
  const CF_REGEX = /^[A-Z0-9]{16}$/;
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_REGEX = /^[+\d\s().-]{6,20}$/;

  const ODD = { '0':1,'1':0,'2':5,'3':7,'4':9,'5':13,'6':15,'7':17,'8':19,'9':21,A:1,B:0,C:5,D:7,E:9,F:13,G:15,H:17,I:19,J:21,K:2,L:4,M:18,N:20,O:11,P:3,Q:6,R:8,S:12,T:14,U:16,V:10,W:22,X:25,Y:24,Z:23 };
  const EVEN = { '0':0,'1':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,A:0,B:1,C:2,D:3,E:4,F:5,G:6,H:7,I:8,J:9,K:10,L:11,M:12,N:13,O:14,P:15,Q:16,R:17,S:18,T:19,U:20,V:21,W:22,X:23,Y:24,Z:25 };
  const CHECK_LETTER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  function isValidCF(cf) {
    if (typeof cf !== 'string') return false;
    const v = cf.trim().toUpperCase();
    if (!CF_REGEX.test(v)) return false;
    let s = 0;
    for (let i = 0; i < 15; i++) {
      const m = ((i + 1) % 2 === 1) ? ODD : EVEN;
      const ch = v[i];
      if (!(ch in m)) return false;
      s += m[ch];
    }
    return v[15] === CHECK_LETTER[s % 26];
  }

  function isAdult(isoDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return false;
    const d = new Date(isoDate + 'T00:00:00Z');
    if (Number.isNaN(d.getTime())) return false;
    const min = new Date();
    min.setUTCFullYear(min.getUTCFullYear() - 18);
    return d <= min;
  }

  // ----- DOM helpers
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // ----- State
  const state = {
    step: 1,
    data: {
      nome: '',
      cognome: '',
      email: '',
      telefono: '',
      dataNascita: '',
      codiceFiscale: '',
      indirizzo: '',
      citta: '',
      cap: '',
      provincia: '',
      consensoLiberatoria: false,
      consensoDati: false,
      consensoNewsletter: false,
      consensoImmagini: false,
      firmaPng: ''
    }
  };

  // ----- Init signature pad
  let signaturePad = null;

  function initSignaturePad() {
    const canvas = $('#firma-canvas');
    if (!canvas || signaturePad) return;
    resizeCanvas(canvas);
    signaturePad = new window.SignaturePad(canvas, {
      backgroundColor: 'rgba(0,0,0,0)',
      penColor: '#1a1a1a',
      minWidth: 0.6,
      maxWidth: 2.4,
      throttle: 16,
      minDistance: 1
    });
    signaturePad.addEventListener('endStroke', () => {
      $('#firma-wrap').classList.add('signed');
      updatePrimaryStateFirma();
    });
  }

  function resizeCanvas(canvas) {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    if (signaturePad) {
      // Mantieni i dati esistenti dopo resize
      const data = signaturePad.toData();
      signaturePad.clear();
      if (data && data.length) signaturePad.fromData(data);
    }
  }

  // ----- Step navigation
  function showStep(n) {
    state.step = n;
    $$('.lib-step').forEach(el => el.classList.toggle('active', Number(el.dataset.step) === n));
    $('.lib-progress-fill').style.width = ((n / TOTAL_STEPS) * 100).toFixed(2) + '%';
    $('#step-indicator').textContent = n === TOTAL_STEPS ? 'Completato' : `Step ${n} di ${TOTAL_STEPS}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (n === 4) {
      // Ritardo per garantire il layout
      setTimeout(() => {
        initSignaturePad();
        if (signaturePad) resizeCanvas($('#firma-canvas'));
      }, 80);
    }
    if (n === 5) renderRiepilogo();
  }

  // ----- Validation step 1
  function validateStep1() {
    const fields = [
      { id: 'nome', test: v => v.trim().length >= 2 },
      { id: 'cognome', test: v => v.trim().length >= 2 },
      { id: 'dataNascita', test: v => isAdult(v), msg: 'Devi essere maggiorenne.' },
      { id: 'codiceFiscale', test: v => isValidCF(v), msg: 'Codice fiscale non valido.' },
      { id: 'email', test: v => EMAIL_REGEX.test(v), msg: 'Email non valida.' },
      { id: 'telefono', test: v => PHONE_REGEX.test(v.trim()) },
      { id: 'indirizzo', test: v => v.trim().length >= 3 },
      { id: 'citta', test: v => v.trim().length >= 2 },
      { id: 'cap', test: v => /^\d{5}$/.test(v.trim()), msg: 'CAP a 5 cifre.' },
      { id: 'provincia', test: v => PROVINCE_IT.indexOf(v.toUpperCase()) >= 0, msg: 'Sigla provincia non valida.' }
    ];
    let firstError = null;
    for (const f of fields) {
      const input = document.getElementById('f-' + f.id);
      const err = document.getElementById('e-' + f.id);
      const val = (input.value || '').trim();
      const ok = f.test(val);
      if (!ok) {
        input.classList.add('error');
        if (err) err.textContent = f.msg || 'Compila questo campo.';
        if (!firstError) firstError = input;
      } else {
        input.classList.remove('error');
        if (err) err.textContent = '';
        state.data[f.id] = val;
      }
    }
    if (state.data.codiceFiscale) state.data.codiceFiscale = state.data.codiceFiscale.toUpperCase();
    if (state.data.provincia) state.data.provincia = state.data.provincia.toUpperCase();
    if (firstError) firstError.focus();
    return !firstError;
  }

  // ----- Consents (step 3)
  // Il <label> toglia gia' l'input nested di default — basta osservare il change.
  function bindConsents() {
    $$('.lib-consent').forEach(block => {
      const input = block.querySelector('input[type="checkbox"]');
      if (!input) return;
      input.addEventListener('change', () => {
        block.classList.toggle('checked', input.checked);
        state.data[input.dataset.key] = input.checked;
        updatePrimaryStateConsents();
      });
    });
  }

  function updatePrimaryStateConsents() {
    const ok = state.data.consensoLiberatoria && state.data.consensoDati;
    $('#btn-step3-next').disabled = !ok;
  }

  function updatePrimaryStateFirma() {
    const ok = signaturePad && !signaturePad.isEmpty() && countPoints(signaturePad) > 12;
    $('#btn-step4-next').disabled = !ok;
  }

  function countPoints(pad) {
    const data = pad.toData();
    if (!data || !data.length) return 0;
    return data.reduce((acc, stroke) => acc + (stroke.points ? stroke.points.length : 0), 0);
  }

  // ----- Riepilogo step 5
  function renderRiepilogo() {
    const d = state.data;
    $('#sum-nome').textContent = `${d.nome} ${d.cognome}`;
    $('#sum-email').textContent = d.email;
    $('#sum-telefono').textContent = d.telefono;
    $('#sum-cf').textContent = d.codiceFiscale;
    $('#sum-residenza').textContent = `${d.indirizzo}, ${d.cap} ${d.citta} (${d.provincia})`;
    $('#sum-data-nascita').textContent = formatDateIT(d.dataNascita);
    setSumConsent('#sum-c1', d.consensoLiberatoria);
    setSumConsent('#sum-c2', d.consensoDati);
    setSumConsent('#sum-c3', d.consensoNewsletter);
    setSumConsent('#sum-c4', d.consensoImmagini);

    // Firma preview
    if (signaturePad && !signaturePad.isEmpty()) {
      const dataUrl = signaturePad.toDataURL('image/png');
      state.data.firmaPng = dataUrl;
      $('#sum-firma-img').src = dataUrl;
    }
  }

  function setSumConsent(sel, yes) {
    const el = $(sel);
    if (!el) return;
    el.textContent = yes ? '\u2713 Si' : '\u2014 No';
    el.classList.toggle('lib-summary-yes', yes);
    el.classList.toggle('lib-summary-no', !yes);
  }

  function formatDateIT(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  // ----- Submit
  async function handleSubmit() {
    if (!signaturePad || signaturePad.isEmpty()) {
      showToast('Manca la firma. Torna allo step firma.');
      return;
    }
    state.data.firmaPng = signaturePad.toDataURL('image/png');

    showLoading(true);
    try {
      const res = await fetch('/api/liberatoria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state.data)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data && data.error ? data.error : 'Errore di invio. Riprova.';
        showToast(msg);
        showLoading(false);
        return;
      }
      showLoading(false);
      showStep(6);
    } catch (err) {
      showLoading(false);
      showToast('Errore di rete. Riprova tra qualche secondo.');
    }
  }

  function showLoading(on) {
    $('#lib-loading').classList.toggle('show', on);
  }

  let toastTimer = null;
  function showToast(msg) {
    const t = $('#lib-toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 4000);
  }

  // ----- Modal privacy
  function bindModal() {
    $('#open-privacy').addEventListener('click', () => {
      $('#privacy-modal').classList.add('show');
    });
    $('#close-privacy').addEventListener('click', () => {
      $('#privacy-modal').classList.remove('show');
    });
    $('#privacy-modal').addEventListener('click', (e) => {
      if (e.target.id === 'privacy-modal') $('#privacy-modal').classList.remove('show');
    });
  }

  // ----- Init
  function init() {
    // Step 1 next
    $('#btn-step1-next').addEventListener('click', () => {
      if (validateStep1()) showStep(2);
    });
    // Step 2 next/back
    $('#btn-step2-next').addEventListener('click', () => showStep(3));
    $('#btn-step2-back').addEventListener('click', () => showStep(1));
    // Step 3
    bindConsents();
    $('#btn-step3-next').addEventListener('click', () => {
      if (state.data.consensoLiberatoria && state.data.consensoDati) showStep(4);
    });
    $('#btn-step3-back').addEventListener('click', () => showStep(2));
    // Step 4
    $('#btn-firma-clear').addEventListener('click', () => {
      if (signaturePad) signaturePad.clear();
      $('#firma-wrap').classList.remove('signed');
      updatePrimaryStateFirma();
    });
    $('#btn-step4-next').addEventListener('click', () => {
      updatePrimaryStateFirma();
      if (!$('#btn-step4-next').disabled) showStep(5);
    });
    $('#btn-step4-back').addEventListener('click', () => showStep(3));
    // Step 5
    $('#btn-step5-confirm').addEventListener('click', handleSubmit);
    $('#btn-step5-back').addEventListener('click', () => showStep(4));

    // Modal privacy
    bindModal();

    // Resize canvas on rotation/resize
    let rTimer = null;
    window.addEventListener('resize', () => {
      if (state.step !== 4) return;
      clearTimeout(rTimer);
      rTimer = setTimeout(() => {
        const c = $('#firma-canvas');
        if (c) resizeCanvas(c);
      }, 200);
    });

    // Telefono default +39
    const telInput = $('#f-telefono');
    if (telInput && !telInput.value) telInput.value = '+39 ';

    // Inizio
    showStep(1);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
