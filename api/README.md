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

## REGOLA #4 — UTM: sempre come custom field, non solo `attributionSource`

GHL ha due posti dove possono finire gli UTM:

1. **`attributionSource`** in upsert — popola il tab "Attribution / Last Source"
   sulla scheda contatto. Comodo ma:
   - non e' filtrabile nelle Smart List
   - non e' esportabile in CSV
   - non e' utilizzabile come variabile/condizione nei workflow
2. **`customFields`** in upsert — popola un custom field visibile direttamente
   sulla scheda contatto. Filtrabile, esportabile, utilizzabile in workflow.

**Sempre passare gli UTM in entrambi i posti.** L'helper `_lib/build-utm-payload.js`
produce il payload corretto. Gli ID dei 5 custom field UTM vivono in
`_lib/utm-fields.js` e devono essere popolati a mano dopo aver creato i field
in GHL Settings → Custom Fields → folder "UTM Attribution" (tipo TEXT).

Per recuperare gli ID dopo la creazione:

```
GET /api/debug-fields?key=<DEBUG_SECRET>
```

Endpoint che usano l'helper: `webinar-lead.js`, `metabolismo-lead.js`,
`candidatura.js`, `soldout-lead.js`. `newsletter.js` passa via webhook GHL,
quindi gli UTM nel body devono essere mappati ai custom field dal workflow GHL
inbound (action "Update Custom Field").

Lato client la cattura UTM e' centralizzata in `/js/utm-capture.js` (first-touch
persistente in `sessionStorage`, chiave `attribution`). Il pattern `getAttribution()`
sopravvive alla navigazione cross-page.

## Checklist prima di mergeare un nuovo endpoint che parla con GHL

- [ ] Il payload `POST /contacts/upsert` NON contiene il campo `tags`?
- [ ] Dopo l'upsert leggo `contact.id` dalla response?
- [ ] Se devo applicare tag, faccio una chiamata separata a `POST /contacts/{id}/tags`?
- [ ] L'errore di add-tag e' non-bloccante (catch + log) per non rompere il flow utente?
- [ ] Ho aggiunto un commento sopra il payload upsert che spiega perche' `tags` e' assente?
- [ ] Gli UTM passano da `buildUtmPayload(body)` (sia `attributionSource` sia `customFields`)?
- [ ] La landing che chiama questo endpoint include `<script src="/js/utm-capture.js"></script>`?

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

---

# Webhook Stripe — runbook operativo

## Endpoint attivi

| Endpoint Stripe | URL Vercel | Eventi | Env secret |
|---|---|---|---|
| `we_1TWgIM...` (OTO €27) | `/api/payment-webhook` | `payment_intent.succeeded`, `checkout.session.completed` | `STRIPE_WEBHOOK_SECRET_OTO` |
| `we_1TUwEZ...` (Club) | `/api/club-stripe-webhook` | `payment_intent.succeeded`, `checkout.session.completed` | `STRIPE_WEBHOOK_SECRET_CLUB` |
| `we_1T1ZFo...` (GHL nativo) | `https://services.leadconnectorhq.com/hooks/.../dd6ed5d2-...` | `checkout.session.completed`, `charge.succeeded`, `invoice.*` | gestito da GHL |

## Monitoring automatico

Due cron Vercel giornalieri coprono diversi casi di failure:

| Cron | Path | Schedule | Cosa cattura |
|---|---|---|---|
| Self-check | `/api/webhook-self-check` | `0 9 * * *` (09:00 UTC) | Webhook irraggiungibili, signature failure, secret malformati |
| Reconciliation | `/api/webhook-reconciliation` | `0 10 * * *` (10:00 UTC) | Acquisti Stripe senza tag GHL corrispondente (= Stripe non manda, workflow GHL down, eventi Stripe rotti, regression tag) + verifica config endpoint Stripe |

Entrambi loggano in Vercel logs con prefix `[self-check]` o `[reconciliation]`.
Se `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` sono settati su Vercel env, il reconciliation manda notifica push immediata su problemi.

Esecuzione manuale:
```
curl -H "Authorization: Bearer $CRON_SECRET" https://go.elenagiordani.com/api/webhook-self-check
curl -H "Authorization: Bearer $CRON_SECRET" https://go.elenagiordani.com/api/webhook-reconciliation
```

I webhook skippano payload con `metadata.product='healthcheck'` o `metadata.plan='healthcheck'` (no side effect su CRM).

Quando aggiungi un nuovo product/plan al checkout, aggiorna le mappe `PRODUCT_TO_TAG` e `PLAN_TO_TAG` in `api/webhook-reconciliation.js` per includere il nuovo tag atteso, altrimenti il reconciliation lo riporterà come "unknown product/plan".

## Checklist: aggiungere/rotare un webhook Stripe in sicurezza

### Creare un nuovo endpoint Stripe via API

```bash
# Esempio: nuovo webhook per /api/foo
curl -sS -X POST https://api.stripe.com/v1/webhook_endpoints \
  -u "$STRIPE_SECRET_KEY:" \
  -d "url=https://go.elenagiordani.com/api/foo" \
  -d "enabled_events[]=payment_intent.succeeded"
# Salva il `secret` dal response: è l'unico momento in cui Stripe lo espone.
```

Mai creare endpoint dalla dashboard se vuoi recuperare il secret subito: solo l'API ritorna `secret` nel JSON.

### Aggiungere il secret a Vercel SENZA il bug del `\n` letterale

**SBAGLIATO:**
```bash
CURRENT=$(grep "^FOO=" /tmp/.env | sed 's/^FOO="//;s/"$//')
printf "%s" "$CURRENT" | vercel env add FOO_NEW production
# CURRENT contiene "\n" letterale (2 char `\` + `n`) preso dal pull → finisce in Vercel → trim() Node non lo rimuove → signature fail.
```

**GIUSTO:** usa il valore puro dal Dashboard Stripe (o dal response JSON di `webhook_endpoints` create) e passalo via heredoc:
```bash
printf "%s" "whsec_xxxxxxxxxxxxxxxxxxxxxxxxxx" | vercel env add FOO production
```

Oppure pulisci sempre prima di re-imporre:
```bash
CLEAN=$(python3 -c "v='$CURRENT'; v=v[:-2] if v.endswith('\\\\n') else v; print(v, end='')")
printf "%s" "$CLEAN" | vercel env add FOO production
```

### Verifica post-deploy

1. Trigger `vercel redeploy <production-url>` per applicare la nuova env
2. Esegui manualmente l'health-check: `curl -H "Authorization: Bearer $CRON_SECRET" https://go.elenagiordani.com/api/webhook-self-check`
3. Atteso: `{"allOk": true, ...}`
4. Se uno dei due risulta `ok:false`, controlla nei log Vercel `[payment-webhook] secret malformato` o `[stripe-webhook] secret malformato` (sanitizer + warning impostato a livello di code).

### Sintomi tipici di webhook rotto

- Vercel log con `Webhook signature failed: No signatures found matching...` ricorrenti.
- Acquisti reali Stripe senza tag GHL applicati / contatti senza `stripe_*` customFields aggiornati.
- Smart List GHL "Acquirenti X" che non si popola dopo nuovi pagamenti.

### In caso di incident: recovery dei pagamenti persi

Stripe non re-invia automaticamente webhook falliti se l'endpoint risponde 200 (anche con error logico). Per recovery manuale:
1. Trova le Checkout Sessions / PaymentIntents `paid`/`succeeded` nel window (Stripe API o Dashboard).
2. Per ognuno costruisci payload + firma con il secret corretto + POST al webhook live (con `created` originale, `Stripe-Signature: t=NOW`). Il webhook è idempotente sui tag (additive) e sui customFields (upsert merge), quindi safe.

## Storia incidente

- **2026-05-13 21:00**: separato `STRIPE_WEBHOOK_SECRET` in `STRIPE_WEBHOOK_SECRET_OTO` e `STRIPE_WEBHOOK_SECRET_CLUB`. Il secret CLUB salvato via `printf "%s"` da stringa estratta da `vercel env pull` ha conservato `\n` letterale finale.
- **2026-05-14 11:00-15:00**: 4 pagamenti Club persi (signature failed silenzioso). Diagnosi via log Vercel + hex dump del .env pull.
- **Recovery**: replay manuale dei 4 webhook con payload Stripe + firma generata da script bash.
- **Fix forward**: sanitizer del secret (strip `\n` letterale) + health-check automatico + runbook (questo file).
