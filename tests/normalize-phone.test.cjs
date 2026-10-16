'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {normalizePhone} = require('../api/_lib/normalize-phone');

test('numbers without a prefix are Italian', () => {
 assert.equal(normalizePhone('366 123 4519'), '+393661234519');
 assert.equal(normalizePhone('393 123 4567'), '+393931234567');
 assert.equal(normalizePhone('06 1234 5678'), '+390612345678');
 assert.equal(normalizePhone('(333) 123-45.67'), '+393331234567');
});

test('an existing prefix is kept', () => {
 assert.equal(normalizePhone('+39 333 123 4567'), '+393331234567');
 assert.equal(normalizePhone('0039 333 123 4567'), '+393331234567');
 assert.equal(normalizePhone('393331234567'), '+393331234567');
 assert.equal(normalizePhone('+41 79 123 45 67'), '+41791234567');
 assert.equal(normalizePhone('0044 7700 900123'), '+447700900123');
});

test('empty input stays empty', () => {
 assert.equal(normalizePhone(''), '');
 assert.equal(normalizePhone(undefined), '');
 assert.equal(normalizePhone(' - '), '');
});
