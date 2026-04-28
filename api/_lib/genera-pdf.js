// Generatore PDF liberatoria firmata.
// Layout A4, font Helvetica (WinAnsi), word-wrap manuale, multi-pagina con footer.

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const {
  TEXT_VERSION,
  TITOLO,
  EVENTO,
  DETTAGLI_EVENTO,
  INFORMATIVA,
  LIBERATORIA,
  CLAUSOLA_FIRMA_DIGITALE,
  PRIVACY_NOTICE,
  CONSENSI
} = require('./liberatoria-text.js');

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = { top: 56, bottom: 64, left: 56, right: 56 };
const CONTENT_WIDTH = A4.width - MARGIN.left - MARGIN.right;
const PINK = rgb(0.913, 0.117, 0.388); // #E91E63
const DARK = rgb(0.10, 0.10, 0.10);
const GRAY = rgb(0.40, 0.40, 0.40);
const GRAY_LIGHT = rgb(0.65, 0.65, 0.65);

// Sanitize: pdf-lib standard fonts usano WinAnsi. Garantisco forma NFC (caratteri precomposed)
// e sostituisco caratteri non rappresentabili nell'encoding standard.
function sanitize(text) {
  if (!text) return '';
  return String(text)
    .normalize('NFC')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u0300-\u036F]/g, ''); // rimuove eventuali combining diacritics residui
}

function wrapText(text, maxWidth, font, size) {
  const paragraphs = sanitize(text).split(/\n+/);
  const lines = [];
  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current ? current + ' ' + word : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    lines.push(''); // spazio tra paragrafi
  }
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function newPage(ctx) {
  ctx.page = ctx.doc.addPage([A4.width, A4.height]);
  ctx.y = A4.height - MARGIN.top;
}

function ensureSpace(ctx, needed) {
  if (ctx.y - needed < MARGIN.bottom) {
    newPage(ctx);
  }
}

function drawTitle(ctx, text) {
  ensureSpace(ctx, 30);
  const size = 13;
  // Rispetta i \n nel titolo (es. titolo su 2 righe)
  const paragraphs = sanitize(text).split(/\n+/);
  for (const para of paragraphs) {
    const lines = wrapText(para, CONTENT_WIDTH, ctx.helvBold, size);
    for (const line of lines) {
      if (line === '') { ctx.y -= 4; continue; }
      ctx.page.drawText(line, {
        x: MARGIN.left,
        y: ctx.y - size,
        size,
        font: ctx.helvBold,
        color: DARK
      });
      ctx.y -= size + 4;
    }
  }
  ctx.y -= 4;
}

function drawEventoBox(ctx, evento) {
  ensureSpace(ctx, 80);
  const boxX = MARGIN.left;
  const boxY = ctx.y - 76;
  const boxW = CONTENT_WIDTH;
  const boxH = 76;
  ctx.page.drawRectangle({
    x: boxX,
    y: boxY,
    width: boxW,
    height: boxH,
    borderColor: PINK,
    borderWidth: 0.8,
    color: rgb(0.997, 0.953, 0.965) // pink-soft
  });
  let cursorY = boxY + boxH - 14;
  ctx.page.drawText('DETTAGLI EVENTO', {
    x: boxX + 14,
    y: cursorY,
    size: 8,
    font: ctx.helvBold,
    color: PINK
  });
  cursorY -= 14;
  const rows = [
    ['Evento', evento.nome],
    ['Date', evento.date],
    ['Luogo', evento.luogo],
    ['Organizzatore', evento.organizzatore]
  ];
  for (const [label, value] of rows) {
    ctx.page.drawText(sanitize(label) + ':', {
      x: boxX + 14,
      y: cursorY,
      size: 8.5,
      font: ctx.helv,
      color: GRAY
    });
    ctx.page.drawText(sanitize(value), {
      x: boxX + 90,
      y: cursorY,
      size: 8.5,
      font: ctx.helvBold,
      color: DARK
    });
    cursorY -= 12;
  }
  ctx.y = boxY - 12;
}

function drawSectionTitle(ctx, text) {
  ensureSpace(ctx, 24);
  ctx.y -= 6;
  const size = 11;
  ctx.page.drawText(sanitize(text), {
    x: MARGIN.left,
    y: ctx.y - size,
    size,
    font: ctx.helvBold,
    color: PINK
  });
  ctx.y -= size + 8;
  // Linea sotto il titolo
  ctx.page.drawLine({
    start: { x: MARGIN.left, y: ctx.y + 4 },
    end: { x: MARGIN.left + 60, y: ctx.y + 4 },
    thickness: 1.2,
    color: PINK
  });
  ctx.y -= 4;
}

function drawParagraph(ctx, text, options = {}) {
  const size = options.size || 9;
  const lineHeight = options.lineHeight || size + 3.5;
  const lines = wrapText(text, CONTENT_WIDTH, ctx.helv, size);
  for (const line of lines) {
    if (line === '') {
      ctx.y -= lineHeight * 0.5;
      continue;
    }
    ensureSpace(ctx, lineHeight);
    ctx.page.drawText(line, {
      x: MARGIN.left,
      y: ctx.y - size,
      size,
      font: ctx.helv,
      color: DARK
    });
    ctx.y -= lineHeight;
  }
}

function drawSpace(ctx, n) {
  ctx.y -= n;
}

function drawDatiAnagrafici(ctx, data) {
  const rows = [
    ['Nome e cognome', `${data.nome} ${data.cognome}`],
    ['Data di nascita', data.dataNascita],
    ['Codice fiscale', data.codiceFiscale],
    ['Email', data.email],
    ['Telefono', data.telefono],
    ['Residenza', `${data.indirizzo}, ${data.cap} ${data.citta} (${data.provincia})`]
  ];
  const labelWidth = 120;
  const size = 10;
  for (const [label, value] of rows) {
    ensureSpace(ctx, 16);
    ctx.page.drawText(sanitize(label), {
      x: MARGIN.left,
      y: ctx.y - size,
      size,
      font: ctx.helv,
      color: GRAY
    });
    const valueLines = wrapText(value, CONTENT_WIDTH - labelWidth, ctx.helvBold, size);
    let lineY = ctx.y - size;
    for (const line of valueLines) {
      ctx.page.drawText(line, {
        x: MARGIN.left + labelWidth,
        y: lineY,
        size,
        font: ctx.helvBold,
        color: DARK
      });
      lineY -= size + 3;
    }
    ctx.y -= size + 6 + (valueLines.length - 1) * (size + 3);
  }
}

function drawConsensi(ctx, data) {
  const items = [
    {
      key: 'C1',
      label: CONSENSI.C1_LIBERATORIA.label,
      value: data.consensoLiberatoria,
      tag: 'OBBLIGATORIO'
    },
    {
      key: 'C2',
      label: CONSENSI.C2_DATI.label,
      value: data.consensoDati,
      tag: 'OBBLIGATORIO'
    },
    {
      key: 'C3',
      label: CONSENSI.C3_NEWSLETTER.label,
      value: data.consensoNewsletter,
      tag: 'FACOLTATIVO'
    },
    {
      key: 'C4',
      label: CONSENSI.C4_IMMAGINI.label,
      value: data.consensoImmagini,
      tag: 'FACOLTATIVO'
    }
  ];
  const size = 9;
  const lineHeight = size + 3.5;
  for (const it of items) {
    ensureSpace(ctx, 36);
    const boxX = MARGIN.left;
    const boxY = ctx.y - 12;
    // Checkbox
    ctx.page.drawRectangle({
      x: boxX,
      y: boxY,
      width: 12,
      height: 12,
      borderColor: it.value ? PINK : GRAY,
      borderWidth: 1.2,
      color: it.value ? PINK : undefined
    });
    if (it.value) {
      // Segno di spunta come "X"
      ctx.page.drawText('X', {
        x: boxX + 2.5,
        y: boxY + 2,
        size: 10,
        font: ctx.helvBold,
        color: rgb(1, 1, 1)
      });
    }
    // Tag
    ctx.page.drawText(`[${it.tag}]`, {
      x: boxX + 22,
      y: ctx.y - 10,
      size: 7,
      font: ctx.helvBold,
      color: it.tag === 'OBBLIGATORIO' ? PINK : GRAY
    });
    ctx.y -= 16;
    // Label (wrap)
    const labelLines = wrapText(it.label, CONTENT_WIDTH - 22, ctx.helv, size);
    for (const line of labelLines) {
      ensureSpace(ctx, lineHeight);
      ctx.page.drawText(line, {
        x: boxX + 22,
        y: ctx.y - size,
        size,
        font: ctx.helv,
        color: DARK
      });
      ctx.y -= lineHeight;
    }
    ctx.y -= 8;
  }
}

async function drawFirma(ctx, data) {
  ensureSpace(ctx, 110);
  // Box firma
  const boxX = MARGIN.left;
  const boxW = 260;
  const boxH = 80;
  const boxY = ctx.y - boxH;
  ctx.page.drawRectangle({
    x: boxX,
    y: boxY,
    width: boxW,
    height: boxH,
    borderColor: GRAY_LIGHT,
    borderWidth: 0.8
  });
  // Embed firma PNG (base64 dataURL -> bytes)
  if (data.firmaPngBytes) {
    try {
      const png = await ctx.doc.embedPng(data.firmaPngBytes);
      const ratio = png.width / png.height;
      let drawW = boxW - 12;
      let drawH = drawW / ratio;
      if (drawH > boxH - 12) {
        drawH = boxH - 12;
        drawW = drawH * ratio;
      }
      ctx.page.drawImage(png, {
        x: boxX + (boxW - drawW) / 2,
        y: boxY + (boxH - drawH) / 2,
        width: drawW,
        height: drawH
      });
    } catch (err) {
      // Non bloccante: se il PNG è corrotto disegno solo il box
      console.warn('[genera-pdf] firma embed failed:', err.message);
    }
  }
  // Etichetta sotto box
  ctx.page.drawText('Firma', {
    x: boxX,
    y: boxY - 12,
    size: 8,
    font: ctx.helv,
    color: GRAY
  });
  // Data + luogo a destra del box
  const rightX = MARGIN.left + boxW + 24;
  const dataItaliana = formatDataIT(data.timestamp);
  ctx.page.drawText('Luogo', {
    x: rightX,
    y: boxY + boxH - 12,
    size: 8,
    font: ctx.helv,
    color: GRAY
  });
  ctx.page.drawText(sanitize(data.citta || ''), {
    x: rightX,
    y: boxY + boxH - 26,
    size: 10,
    font: ctx.helvBold,
    color: DARK
  });
  ctx.page.drawText('Data e ora firma', {
    x: rightX,
    y: boxY + 30,
    size: 8,
    font: ctx.helv,
    color: GRAY
  });
  ctx.page.drawText(dataItaliana, {
    x: rightX,
    y: boxY + 16,
    size: 10,
    font: ctx.helvBold,
    color: DARK
  });
  ctx.y = boxY - 24;
}

function drawMetadati(ctx, data) {
  ensureSpace(ctx, 80);
  drawSectionTitle(ctx, 'METADATI DELLA FIRMA');
  const rows = [
    ['Versione testo firmato', data.textVersion],
    ['Timestamp ISO 8601 (UTC)', data.timestamp],
    ['Indirizzo IP firmatario', data.ip || '(non disponibile)'],
    ['User agent', truncate(data.userAgent || '', 110)]
  ];
  const labelWidth = 180;
  const size = 9;
  for (const [label, value] of rows) {
    ensureSpace(ctx, 14);
    ctx.page.drawText(sanitize(label), {
      x: MARGIN.left,
      y: ctx.y - size,
      size,
      font: ctx.helv,
      color: GRAY
    });
    ctx.page.drawText(sanitize(value), {
      x: MARGIN.left + labelWidth,
      y: ctx.y - size,
      size,
      font: ctx.helv,
      color: DARK
    });
    ctx.y -= size + 5;
  }
  ctx.y -= 6;
  const note = 'L\u2019hash SHA-256 di integrit\u00E0 di questo documento \u00E8 calcolato dopo la generazione del PDF e archiviato come metadato del contatto sul CRM (custom field "liberatoria_pdf_hash_sha256"). Per verificare l\u2019integrit\u00E0 del documento, calcolare l\u2019hash SHA-256 del file e confrontarlo con il valore archiviato.';
  drawParagraph(ctx, note, { size: 8, lineHeight: 11 });
}

function applyFooters(ctx) {
  const pages = ctx.doc.getPages();
  const total = pages.length;
  const size = 7;
  const footerLine1 = `Liberatoria training Elena Giordani  -  versione testo ${ctx.data.textVersion}  -  firmato il ${ctx.data.timestamp}`;
  const footerLine2 = `IP firmatario: ${ctx.data.ip || 'n/d'}  -  Documento con valore di firma elettronica semplice (FES) ai sensi del Reg. UE 910/2014 (eIDAS)`;
  pages.forEach((page, idx) => {
    page.drawLine({
      start: { x: MARGIN.left, y: MARGIN.bottom - 8 },
      end: { x: A4.width - MARGIN.right, y: MARGIN.bottom - 8 },
      thickness: 0.4,
      color: GRAY_LIGHT
    });
    page.drawText(sanitize(footerLine1), {
      x: MARGIN.left,
      y: MARGIN.bottom - 20,
      size,
      font: ctx.helv,
      color: GRAY
    });
    page.drawText(sanitize(footerLine2), {
      x: MARGIN.left,
      y: MARGIN.bottom - 30,
      size,
      font: ctx.helv,
      color: GRAY
    });
    const pageLabel = `Pagina ${idx + 1} di ${total}`;
    const w = ctx.helv.widthOfTextAtSize(pageLabel, size);
    page.drawText(pageLabel, {
      x: A4.width - MARGIN.right - w,
      y: MARGIN.bottom - 20,
      size,
      font: ctx.helv,
      color: GRAY
    });
  });
}

function formatDataIT(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '\u2026' : s;
}

async function generaPDF(data) {
  const doc = await PDFDocument.create();

  doc.setTitle(`Liberatoria training - ${data.nome} ${data.cognome}`);
  doc.setAuthor('Elena Giordani - X-Fit Academy');
  doc.setSubject(`Liberatoria training firmata - versione ${TEXT_VERSION}`);
  doc.setKeywords([
    `textVersion:${TEXT_VERSION}`,
    `signedAt:${data.timestamp}`,
    `signerEmail:${data.email}`,
    `eventTag:${data.eventTag || 'liberatoria-firmata'}`
  ]);
  doc.setProducer('elenagiordani.com');
  doc.setCreator('elenagiordani.com - liberatoria digital signing');
  const created = new Date(data.timestamp);
  doc.setCreationDate(created);
  doc.setModificationDate(created);

  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const helvOblique = await doc.embedFont(StandardFonts.HelveticaOblique);

  const ctx = {
    doc,
    helv,
    helvBold,
    helvOblique,
    page: null,
    y: 0,
    data: { ...data, textVersion: TEXT_VERSION }
  };

  // Pagina 1+: testo informativa + liberatoria + clausola firma elettronica
  newPage(ctx);
  drawTitle(ctx, TITOLO);
  drawSpace(ctx, 6);
  drawEventoBox(ctx, EVENTO);
  drawSpace(ctx, 4);
  drawParagraph(ctx, DETTAGLI_EVENTO, { size: 9, lineHeight: 12 });
  drawSpace(ctx, 6);
  drawParagraph(ctx, INFORMATIVA, { size: 9, lineHeight: 12 });

  drawSpace(ctx, 12);
  drawSectionTitle(ctx, 'LIBERATORIA');
  drawParagraph(ctx, LIBERATORIA, { size: 9, lineHeight: 12 });

  drawSpace(ctx, 12);
  drawSectionTitle(ctx, 'METADATI DI FIRMA ELETTRONICA');
  drawParagraph(ctx, CLAUSOLA_FIRMA_DIGITALE, { size: 8.5, lineHeight: 11.5 });

  // Pagina dati + consensi + firma
  newPage(ctx);
  drawSectionTitle(ctx, 'DATI PARTECIPANTE');
  drawDatiAnagrafici(ctx, ctx.data);

  drawSpace(ctx, 8);
  drawSectionTitle(ctx, 'CONSENSI ESPRESSI');
  drawConsensi(ctx, ctx.data);

  drawSpace(ctx, 8);
  drawSectionTitle(ctx, 'FIRMA');
  await drawFirma(ctx, ctx.data);

  drawSpace(ctx, 24);
  drawMetadati(ctx, ctx.data);

  // Pagina informativa privacy
  newPage(ctx);
  drawSectionTitle(ctx, 'INFORMATIVA SULLA PRIVACY');
  drawParagraph(ctx, PRIVACY_NOTICE, { size: 7.8, lineHeight: 10.5 });

  // Footer su tutte le pagine
  applyFooters(ctx);

  return await doc.save({ useObjectStreams: false });
}

module.exports = { generaPDF };
