const { EVENTI, createSignatureHandler } = require('./_lib/firma-eventi.js');

module.exports = createSignatureHandler(EVENTI.escape);
