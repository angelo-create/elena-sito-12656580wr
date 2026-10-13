const { deflateSync } = require('node:zlib');
const { FIELDS, FOLDER_NAME } = require('../api/_lib/escape-ghl');
const text = require('../js/escape-text');

function pngSignature() {
  function crc32(buffer) {
    let crc = -1;
    for (const byte of buffer) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ -1) >>> 0;
  }
  function chunk(type, data) {
    const name = Buffer.from(type); const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
    return Buffer.concat([size, name, data, crc]);
  }
  const width = 500, height = 180;
  const pixels = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = y * (width * 4 + 1) + 1 + x * 4;
    const ink = Math.abs(y - (90 + 50 * Math.sin(x / 9))) < 3;
    pixels.set([ink ? 25 : 255, ink ? 25 : 255, ink ? 25 : 255, 255], offset);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}

function payload(overrides = {}) {
  return { nome: 'Maria', cognome: 'Rossi', email: 'escape-test@example.invalid', telefono: '+393331234567',
    dataNascita: '1980-01-01', codiceFiscale: 'RSSMRA80A41H501Y', indirizzo: 'Via Test 1', citta: 'Roma', cap: '00144', provincia: 'RM',
    consensoLiberatoria: true, consensoDati: true, consensoImmagini: true, consensoNewsletter: false,
    textVersion: text.TEXT_VERSION, submissionId: require('node:crypto').randomUUID(), firmaPng: `data:image/png;base64,${pngSignature().toString('base64')}`, ...overrides };
}

function mockGhl() {
  const state = { notes: [{ id: 'coach-note', body: 'Historical Coach signature' }], uploads: [], calls: [], fail: '',
    fields: { legacy: 'previous-coach.pdf', marketing: 'true' }, tags: ['coach', 'newsletter-existing'] };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  state.fetch = async (url, options = {}) => {
    const path = new URL(url).pathname; const method = options.method || 'GET';
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    state.calls.push({ path, method, body });
    if (state.fail && `${method} ${path}`.includes(state.fail)) return json({ message: 'Failure fixture' }, 503);
    if (path.endsWith('/customFields')) return json({ customFields: FIELDS.map(f => ({ id: f.key, fieldKey: 'contact.' + f.key })) });
    if (path === '/medias/files') return json({ files: [{ _id: 'escape-folder', name: FOLDER_NAME, type: 'folder' }] });
    if (path === '/contacts/upsert') return json({ contact: { id: 'existing-contact' } });
    if (path.endsWith('/notes') && method === 'GET') return json({ notes: state.notes });
    if (path.endsWith('/notes') && method === 'POST') {
      const note = { id: `note-${state.notes.length}`, body: body.body }; state.notes.push(note); return json({ note });
    }
    if (path === '/medias/upload-file') {
      state.uploads.push(Buffer.from(await body.get('file').arrayBuffer()));
      return json({ fileId: `pdf-${state.uploads.length}`, url: `https://storage.example.invalid/escape-${state.uploads.length}.pdf` });
    }
    if (path.endsWith('/existing-contact') && method === 'PUT') { for (const field of body.customFields) state.fields[field.id] = field.field_value; return json({ success: true }); }
    if (path.endsWith('/tags')) { state.tags = [...new Set([...state.tags, ...body.tags])]; return json({ tags: state.tags }); }
    if (path === '/escape-email') return json({ accepted: true });
    throw new Error(`Unexpected fixture call ${method} ${path}`);
  };
  return state;
}
module.exports = { pngSignature, payload, mockGhl };
