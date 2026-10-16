// Telefono in formato internazionale prima di mandarlo a GHL.
//
// Se il numero arriva senza prefisso ("366 123 4567") GHL il paese lo sceglie
// da solo, e a volte sbaglia: il 16/10/2026 un cellulare italiano dalla lista
// d'attesa Escape è finito in CRM come +62 (Indonesia). Qui i numeri senza
// prefisso sono italiani: diventano +39. Chi scrive già un prefisso (+41,
// 0044...) lo tiene.

function normalizePhone(raw) {
    let p = String(raw || '').trim().replace(/[^\d+]/g, '');
    if (!p) return '';
    if (p.startsWith('00')) p = '+' + p.slice(2);
    if (p.startsWith('+')) return '+' + p.slice(1).replace(/\+/g, '');
    p = p.replace(/\+/g, '');
    // "393331234567": prefisso 39 scritto senza il +. Un cellulare italiano ha
    // 10 cifre e i fissi iniziano per 0, quindi 11-12 cifre che iniziano per 39
    // hanno già il prefisso.
    if (/^39\d{9,10}$/.test(p)) return '+' + p;
    return '+39' + p;
}

module.exports = { normalizePhone };
