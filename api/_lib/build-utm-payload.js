// Helper condiviso per gli endpoint contact-upsert: produce sia
// attributionSource (popola il tab Attribution di GHL) sia customFields[]
// (popola la scheda contatto, smart list, export CSV, workflow).
//
// Vedi api/README.md REGOLA #4 per il razionale.

const UTM_FIELD_IDS = require('./utm-fields');

function clip(v, max) {
    if (max === undefined) max = 500;
    return v ? String(v).slice(0, max) : undefined;
}

function buildUtmPayload(body) {
    if (!body) body = {};

    const attr = {};
    if (body.utm_source)   attr.utmSource   = clip(body.utm_source);
    if (body.utm_medium)   attr.medium      = clip(body.utm_medium);
    if (body.utm_campaign) attr.campaign    = clip(body.utm_campaign);
    if (body.utm_content)  attr.utmContent  = clip(body.utm_content);
    if (body.utm_term)     attr.utmKeyword  = clip(body.utm_term);
    if (body.referrer)     attr.referrer    = clip(body.referrer, 1000);
    if (body.landing_url)  attr.url         = clip(body.landing_url, 1000);
    if (body.fbclid)       attr.fbclid      = clip(body.fbclid);
    if (body.gclid)        attr.gclid       = clip(body.gclid);
    if (body.msclkid)      attr.msclikid    = clip(body.msclkid);

    const customFields = [];
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(function(k) {
        if (body[k] && UTM_FIELD_IDS[k]) {
            customFields.push({ id: UTM_FIELD_IDS[k], value: clip(body[k]) });
        }
    });

    return {
        attributionSource: Object.keys(attr).length ? attr : null,
        customFields: customFields
    };
}

module.exports = { buildUtmPayload };
