#!/usr/bin/env node
// Default read-only. --apply creates only the event's missing fields and its empty folder.
// node --env-file=.env.vercel.local scripts/setup-ghl-firma.js <escape|ncvNov> [--apply]
const { EVENTI, createClient } = require('../api/_lib/firma-eventi.js');

(async () => {
  const evento = EVENTI[process.argv[2]];
  if (!evento) throw new Error(`Evento sconosciuto. Usa uno di: ${Object.keys(EVENTI).join(', ')}`);
  const client = createClient(evento);
  const apply = process.argv.includes('--apply');
  if (evento.fields.length) {
    const { customFields = [] } = await client.request(`/locations/${client.locationId}/customFields?model=contact`);
    const keys = new Set(customFields.map(f => f.fieldKey.replace(/^contact\./, '')));
    for (const field of evento.fields) {
      if (keys.has(field.key)) { console.log('OK', field.key); continue; }
      if (!apply) { console.log('MISSING', field.key); continue; }
      await client.request(`/locations/${client.locationId}/customFields`, { method: 'POST', body: JSON.stringify({ name: field.name, fieldKey: field.key, dataType: field.dataType, model: 'contact' }) });
      console.log('CREATED', field.key);
    }
  }
  if (await client.findFolder()) console.log('OK', evento.folderName);
  else if (apply) {
    await client.request('/medias/folder', { method: 'POST', body: JSON.stringify({ name: evento.folderName, altId: client.locationId, altType: 'location' }) });
    console.log('CREATED', evento.folderName);
  } else console.log('MISSING', evento.folderName);
  console.log('EMAIL_WEBHOOK', evento.emailWebhookEnv, process.env[evento.emailWebhookEnv] ? 'configured, delivery unverified' : 'not configured');
  try { await client.configuration(); console.log('STORAGE_READY'); }
  catch (error) { console.log('STORAGE_NOT_READY', error.message); process.exitCode = 1; }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
