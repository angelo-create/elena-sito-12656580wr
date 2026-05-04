# API endpoint — Procedura GHL (REGOLE)

Documento per evitare di reintrodurre il bug "tag cancellati" che e' costato il
recovery di ~50-100 contatti.

## REGOLA #1 — Mai passare `tags` a `POST /contacts/upsert`

L'API GHL `POST /contacts/upsert`, quando riceve il campo `tags`, **sostituisce
in toto** l'array tag del contatto. Significa: tutti i tag accumulati prima
(newsletter, webinar, metabolismo, segmenti custom...) vengono cancellati.

### Sbagliato

```js
fetch('https://services.leadconnectorhq.com/contacts/upsert', {
  method: 'POST',
  body: JSON.stringify({
    locationId, email, firstName, lastName,
    tags: ['mio-nuovo-tag']  // CANCELLA TUTTI I TAG ESISTENTI
  })
});
```

### Giusto — pattern in due step

```js
// Step 1: upsert SENZA campo tags
const upsertRes = await fetch(`${GHL_API_BASE}/contacts/upsert`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    locationId, email, firstName, lastName,
    // niente tags qui
  })
});
const data = await upsertRes.json();
const contactId = data.contact?.id;

// Step 2: aggiungi tag in modo ADDITIVO con endpoint dedicato
if (contactId) {
  await fetch(`${GHL_API_BASE}/contacts/${contactId}/tags`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ tags: ['mio-nuovo-tag'] })
  });
}
```

`POST /contacts/{id}/tags` e' additivo nativo, no-op su tag gia' presenti,
quindi anche idempotente in caso di retry.

## REGOLA #2 — Webhook GHL: usa "Add Tag", non "Update Contact" con tags

Se invece di chiamare l'API direttamente fai POST a un webhook GHL inbound
(pattern usato in `newsletter.js`), il workflow GHL deve usare l'azione
**"Add Tag"** (additiva). NON usare l'azione "Update Contact" passando il
campo tags, perche' anche quella sovrascrive.

## REGOLA #3 — Custom field si possono passare in upsert

Il bug riguarda SOLO il campo `tags`. I `customFields` in upsert vengono
mergiati correttamente (nuovo valore aggiorna, gli altri restano). Ok
continuare a passarli nel body upsert.

## Checklist prima di mergeare un nuovo endpoint che parla con GHL

- [ ] Il payload `POST /contacts/upsert` NON contiene il campo `tags`?
- [ ] Dopo l'upsert leggo `contact.id` dalla response?
- [ ] Se devo applicare tag, faccio una chiamata separata a `POST /contacts/{id}/tags`?
- [ ] L'errore di add-tag e' non-bloccante (catch + log) per non rompere il flow utente?
- [ ] Ho aggiunto un commento sopra il payload upsert che spiega perche' `tags` e' assente?

## Endpoint GHL di riferimento usati dal progetto

| Endpoint | Comportamento sui tag | File |
|---|---|---|
| `POST /contacts/upsert` con `tags` | SOVRASCRIVE (non usare) | — |
| `POST /contacts/upsert` senza `tags` | Lascia inalterati | `liberatoria.js`, `webinar-lead.js`, `metabolismo-lead.js` |
| `POST /contacts/{id}/tags` | ADDITIVO | tutti gli endpoint sopra |
| Webhook inbound + workflow "Add Tag" | ADDITIVO | `newsletter.js` |

## Storia incidente

- **Aprile 2026**: bug introdotto in `liberatoria.js` (`tags: [eventTag]` in upsert).
- **Stesso pattern** poi copiato in `webinar-lead.js` e `metabolismo-lead.js`.
- **Maggio 2026**: identificato. ~50-100 contatti con tag cancellati alla firma.
- **Recovery**: `scripts/restore-tags-from-audit.js` riapplica i tag dall'audit
  log GHL (retention 60gg, esportabile in CSV da `Sub-Account → Settings → Audit Logs`).
- **Fix forward**: pattern in due step adottato in tutti gli endpoint contact-upsert.
