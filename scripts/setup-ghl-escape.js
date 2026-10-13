#!/usr/bin/env node
// Default read-only. --apply creates only missing Escape fields and its empty folder.
// node --env-file=.env.vercel.local scripts/setup-ghl-escape.js [--apply]
const { createClient, FIELDS, FOLDER_NAME } = require('../api/_lib/escape-ghl.js');

(async () => {
  const client = createClient();
  const apply = process.argv.includes('--apply');
  const { customFields = [] } = await client.request(`/locations/${client.locationId}/customFields?model=contact`);
  const keys = new Set(customFields.map(f => f.fieldKey.replace(/^contact\./, '')));
  for (const field of FIELDS) {
    if (keys.has(field.key)) { console.log('OK', field.key); continue; }
    if (!apply) { console.log('MISSING', field.key); continue; }
    await client.request(`/locations/${client.locationId}/customFields`, { method: 'POST', body: JSON.stringify({ name: field.name, fieldKey: field.key, dataType: field.dataType, model: 'contact' }) });
    console.log('CREATED', field.key);
  }
  const { files = [] } = await client.request(`/medias/files?${new URLSearchParams({ altId: client.locationId, altType: 'location', sortBy: 'createdAt', sortOrder: 'desc', type: 'folder', query: FOLDER_NAME, limit: '100' })}`);
  if (files.some(f => f.name === FOLDER_NAME && f.type === 'folder' && !f.deleted)) console.log('OK', FOLDER_NAME);
  else if (apply) {
    await client.request('/medias/folder', { method: 'POST', body: JSON.stringify({ name: FOLDER_NAME, altId: client.locationId, altType: 'location' }) });
    console.log('CREATED', FOLDER_NAME);
  } else console.log('MISSING', FOLDER_NAME);
  try {
    const { workflows = [] } = await client.request(`/workflows/?locationId=${client.locationId}`);
    const matches = workflows.filter(w => /escape/i.test(w.name));
    console.log('ESCAPE_WORKFLOWS', JSON.stringify(matches.map(w => ({ name: w.name, status: w.status }))));
    console.log('Workflow list does not verify email actions, template or delivery.');
  } catch (error) { console.log('WORKFLOW_UNVERIFIED', error.message); }
  console.log('ESCAPE_EMAIL_WEBHOOK', process.env.GHL_ESCAPE_EMAIL_WEBHOOK_URL ? 'configured, delivery unverified' : 'not configured');
  try { await client.configuration(); console.log('STORAGE_READY'); }
  catch (error) { console.log('STORAGE_NOT_READY', error.message); process.exitCode = 1; }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
