const FOLDER_NAME = 'Liberatorie Escape 2026';
const TAG = 'liberatoria-firmata-escape-2026';
const FIELDS = [
  'pdf_url', 'pdf_file_id', 'pdf_filename', 'signed_at', 'text_version',
  'pdf_hash_sha256', 'submission_id', 'consenso_liberatoria', 'consenso_dati',
  'consenso_immagini', 'consenso_newsletter'
].map(key => ({ key: `escape_2026_${key}`, name: `Escape 2026 - ${key}`, dataType: 'TEXT' }));

function createClient(env = process.env, fetcher = fetch) {
  const locationId = env.GHL_LOCATION_ID;
  if (!locationId || !env.GHL_PIT_TOKEN) throw new Error('Configurazione GHL mancante');
  async function request(path, options = {}) {
    const response = await fetcher(`https://services.leadconnectorhq.com${path}`, {
      ...options,
      signal: AbortSignal.timeout(12000),
      headers: {
        Authorization: `Bearer ${env.GHL_PIT_TOKEN}`, Version: '2021-07-28',
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers
      }
    });
    if (!response.ok) throw new Error(`GHL ${options.method || 'GET'} ${path.split('?')[0]}: HTTP ${response.status}`);
    return response.json();
  }
  async function configuration() {
    const { customFields = [] } = await request(`/locations/${locationId}/customFields?model=contact`);
    const fieldIds = Object.fromEntries(customFields.map(f => [(f.fieldKey || '').replace(/^contact\./, ''), f.id]));
    const missing = FIELDS.filter(f => !fieldIds[f.key]);
    if (missing.length) throw new Error(`Campi Escape mancanti: ${missing.map(f => f.key).join(', ')}`);
    // Search by exact name: never silently store Escape in the historical event folder.
    const { files = [] } = await request(`/medias/files?${new URLSearchParams({ altId: locationId, altType: 'location', sortBy: 'createdAt', sortOrder: 'desc', type: 'folder', query: FOLDER_NAME, limit: '100' })}`);
    const folder = files.find(f => f.name === FOLDER_NAME && f.type === 'folder' && !f.deleted);
    if (!folder) throw new Error('Cartella Escape mancante');
    return { folderId: folder._id || folder.id, fieldIds };
  }
  return { request, configuration, locationId };
}
module.exports = { createClient, FOLDER_NAME, TAG, FIELDS };
