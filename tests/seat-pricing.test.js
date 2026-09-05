'use strict';

const assert = require('assert');
const pricing = require('../seat-pricing');

assert.strictEqual(pricing.EVENT_ID, 'standup-therapy-deja-de-joder-pareja-bogota-5nov2026');
assert.strictEqual(pricing.getTierForSeat('A-1').id, 'lateral');
assert.strictEqual(pricing.getTierForSeat('A-1').color, '#fff0d6');
assert.strictEqual(pricing.getPriceForSeat('A-1'), 49000);
assert.strictEqual(pricing.getPriceForSeat('A-3'), 49000);
assert.strictEqual(pricing.getPriceForSeat('A-4'), 59000);
assert.strictEqual(pricing.getPriceForSeat('A-5'), 59000);
assert.strictEqual(pricing.getTierForSeat('A-6').id, 'preferencial');
assert.strictEqual(pricing.getPriceForSeat('A-6'), 79000);
assert.strictEqual(pricing.getPriceForSeat('C-17'), 79000);
assert.strictEqual(pricing.getPriceForSeat('C-18'), 59000);
assert.strictEqual(pricing.getPriceForSeat('D-6'), 59000);
assert.strictEqual(pricing.getPriceForSeat('J-20'), 49000);
assert.strictEqual(pricing.getPriceForSeat('J-22'), 49000);
assert.strictEqual(pricing.getPriceForSeat('K-19'), 59000);
assert.strictEqual(pricing.summarizeSeats(['A-1', 'A-6', 'K-19']).total, 187000);
assert.throws(() => pricing.getPriceForSeat('K-20'), /Silla inválida/);
assert.throws(() => pricing.summarizeSeats(['A-1', 'A-1']), /repetidas/);

const configuredLateralSeats = [];
for (const row of 'ABCDEFGHIJ') {
  for (const number of [1, 2, 3, 20, 21, 22]) {
    configuredLateralSeats.push(row + '-' + number);
  }
}
assert.strictEqual(configuredLateralSeats.length, 60);
assert(configuredLateralSeats.every(seat => pricing.getPriceForSeat(seat) === 49000));

const configuredPreferentialSeats = [];
for (const row of 'ABC') {
  for (let number = 6; number <= 17; number += 1) {
    configuredPreferentialSeats.push(row + '-' + number);
  }
}
assert.strictEqual(configuredPreferentialSeats.length, 36);
assert(configuredPreferentialSeats.every(seat => pricing.getPriceForSeat(seat) === 79000));

const mixedPricing = pricing.createPricingEngine({
  defaultTierId: 'general',
  tiers: [
    { id: 'general', label: 'General', price: 59000, color: '#f9b609' },
    { id: 'economica', label: 'Económica', price: 39000, color: '#fff0d6' },
  ],
  rules: [
    { tierId: 'economica', seats: ['A-1'] },
    { tierId: 'economica', rows: ['K'] },
    { tierId: 'economica', rows: ['J'], from: 1, to: 5 },
  ],
});

assert.strictEqual(mixedPricing.getTierForSeat('A-1').id, 'economica');
assert.strictEqual(mixedPricing.getPriceForSeat('A-2'), 59000);
assert.strictEqual(mixedPricing.getPriceForSeat('J-5'), 39000);
assert.strictEqual(mixedPricing.getPriceForSeat('J-6'), 59000);
assert.strictEqual(mixedPricing.getPriceForSeat('K-19'), 39000);

const mixedSummary = mixedPricing.summarizeSeats(['A-1', 'A-2', 'K-19']);
assert.strictEqual(mixedSummary.total, 137000);
assert.deepStrictEqual(
  mixedSummary.breakdown.map((item) => [item.tierId, item.quantity, item.subtotal]),
  [['economica', 2, 78000], ['general', 1, 59000]],
);

console.log('seat-pricing tests passed');
